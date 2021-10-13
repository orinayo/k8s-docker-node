import express, {Express} from 'express';
import {MongoClient, ObjectId, Db} from 'mongodb';
import amqp from 'amqplib';
import {json} from 'body-parser';

type Microservice = {
	app: Express;
	db: Db;
	messageChannel: amqp.Channel;
	close?: () => Promise<void>;
};

// Connect to the database.
async function connectDb(dbHost: string, dbName: string) {
	const client = await MongoClient.connect(dbHost);
	const db = client.db(dbName);
	return {
		db: db,
		close: () => {
			return client.close();
		},
	};
}

// Connect to the RabbitMQ server.
async function connectRabbit(rabbitHost: string) {
	const messagingConnection = await amqp.connect(rabbitHost);
	return await messagingConnection.createChannel();
}

// Define HTTP route handlers.
async function setupHandlers(microservice: Microservice) {
	const videosCollection = microservice.db.collection('videos');

	// HTTP GET API to retrieve list of videos from the database.
	microservice.app.get(
		'/videos',
		async (_: express.Request, res: express.Response) => {
			try {
				const videos = await videosCollection.find().toArray(); // This should be paginated.
				res.json({
					videos: videos,
				});
			} catch (err: any) {
				console.error('Failed to get videos collection from database!');
				console.error((err && err.stack) || err);
				res.sendStatus(500);
			}
		}
	);

	// HTTP GET API to retrieve details for a particular video.
	microservice.app.get(
		'/video',
		async (req: express.Request, res: express.Response) => {
			const videoId = new ObjectId(req.query.id as string);
			try {
				const video = await videosCollection.findOne({_id: videoId});
				if (!video) {
					res.sendStatus(404);
				} else {
					res.json({video});
				}
			} catch (err) {
				console.error(`Failed to get video ${videoId}.`);
				console.error(err);
				res.sendStatus(500);
			}
		}
	);

	// Handle incoming RabbitMQ messages.
	async function consumeVideoUploadedMessage(
		msg: amqp.ConsumeMessage | null
	) {
		if (msg === null) {
			throw new Error("Video uploaded message is missing");
		}
		const parsedMsg = JSON.parse(msg.content.toString());

		const videoMetadata = {
			_id: new ObjectId(parsedMsg.video.id),
			name: parsedMsg.video.name,
		};

		await videosCollection.insertOne(videoMetadata);
		microservice.messageChannel.ack(msg);
	}

	// Add other handlers here.
	await microservice.messageChannel.assertExchange(
		'video-uploaded',
		'fanout'
	); // Assert that we have a "video-uploaded" exchange.
	const response = await microservice.messageChannel.assertQueue('', {});
	const queueName = response.queue;
	await microservice.messageChannel.bindQueue(
		queueName,
		'video-uploaded',
		''
	); // Bind the queue to the exchange.
	return microservice.messageChannel.consume(
		queueName,
		consumeVideoUploadedMessage
	);
}

// Starts the Express HTTP server.
function startHttpServer(
	dbConn: {
		db: Db;
		close: () => Promise<void>;
	},
	messageChannel: amqp.Channel
) {
	return new Promise((resolve) => {
		// Wrap in a promise so we can be notified when the server has started.
		const app = express();
		const microservice: Microservice = {
			// Create an object to represent microservice.
			app: app,
			db: dbConn.db,
			messageChannel: messageChannel,
		};
		// Enable JSON body for HTTP requests.
		app.use(json());
		setupHandlers(microservice);

		const port = (process.env.PORT && parseInt(process.env.PORT)) || 3000;
		const server = app.listen(port, () => {
			microservice.close = async () => {
				// Create a function that can be used to close the server and database.
				await new Promise<void>((resolve) => {
					server.close(() => {
						resolve();
					});
				});
				return dbConn.close();
			};
			resolve(microservice);
		});
	});
}

// Collect code here that executes when the microservice starts.
async function startMicroservice(
	dbHost: string,
	dbName: string,
	rabbitHost: string
) {
	// Connect to the database...
	const dbConn = await connectDb(dbHost, dbName);
	// connect to RabbitMQ...
	const messageChannel = await connectRabbit(rabbitHost);
	return startHttpServer(dbConn, messageChannel);
}

// Application entry point.
function main() {
	if (!process.env.DBHOST) {
		throw new Error(
			'Please specify the databse host using environment variable DBHOST.'
		);
	}

	const DBHOST = process.env.DBHOST;

	if (!process.env.DBNAME) {
		throw new Error(
			'Please specify the databse name using environment variable DBNAME.'
		);
	}

	const DBNAME = process.env.DBNAME;

	if (!process.env.RABBIT) {
		throw new Error(
			'Please specify the name of the RabbitMQ host using environment variable RABBIT'
		);
	}

	const RABBIT = process.env.RABBIT;

	return startMicroservice(DBHOST, DBNAME, RABBIT);
}

if (require.main === module) {
	// Only start the microservice normally if this script is the "main" module.
	main()
		.then(() => console.log('Microservice online.'))
		.catch((err) => {
			console.error('Microservice failed to start.');
			console.error((err && err.stack) || err);
		});
} else {
	// Otherwise we are running under test
	module.exports = {
		startMicroservice,
	};
}
