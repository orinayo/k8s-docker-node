import express, {Application} from 'express';
import http from 'http';
import {MongoClient, ObjectId, Db} from 'mongodb';
import amqp from 'amqplib';

const app = express();

if (!process.env.PORT) {
	throw new Error(
		'Please specify the port number for the HTTP server with the environment variable PORT.'
	);
}

if (!process.env.VIDEO_STORAGE_HOST) {
	throw new Error(
		'Please specify the host name for the video storage microservice in variable VIDEO_STORAGE_HOST.'
	);
}

if (!process.env.VIDEO_STORAGE_PORT) {
	throw new Error(
		'Please specify the port number for the video storage microservice in variable VIDEO_STORAGE_PORT.'
	);
}

if (!process.env.DBHOST) {
	throw new Error(
		'Please specify the databse host using environment variable DBHOST.'
	);
}

if (!process.env.DBNAME) {
	throw new Error(
		'Please specify the name of the database using environment variable DBNAME'
	);
}

if (!process.env.RABBIT) {
	throw new Error(
		'Please specify the name of the RabbitMQ host using environment variable RABBIT'
	);
}

//
// Extracts environment variables to globals for convenience.
//
const PORT = process.env.PORT;
const VIDEO_STORAGE_HOST = process.env.VIDEO_STORAGE_HOST;
const VIDEO_STORAGE_PORT = parseInt(process.env.VIDEO_STORAGE_PORT);
const DBHOST = process.env.DBHOST;
const DBNAME = process.env.DBNAME;
const RABBIT = process.env.RABBIT;
console.log(
	`Forwarding video requests to ${VIDEO_STORAGE_HOST}:${VIDEO_STORAGE_PORT}.`
);

//
// Connect to the database.
//
async function connectDb() {
	const client = await MongoClient.connect(DBHOST);
	return client.db(DBNAME);
}

//
// Connect to the RabbitMQ server.
//
async function connectRabbit() {
	console.log(`Connecting to RabbitMQ server at ${RABBIT}.`);
	// Connect to the RabbitMQ server.
	const connection = await amqp.connect(RABBIT);
	console.log('Connected to RabbitMQ.');
	const messageChannel = await connection.createChannel(); // Create a RabbitMQ messaging channel.
	await messageChannel.assertExchange('viewed', 'fanout'); // Assert that we have a "viewed" exchange.
	return messageChannel;
}

//
// Send the "viewed" to the history microservice.
//
function sendViewedMessage(messageChannel: amqp.Channel, videoPath: string) {
	console.log(`Publishing message on "viewed" exchange.`);

	const msg = {videoPath: videoPath};
	const jsonMsg = JSON.stringify(msg);
	messageChannel.publish('', 'viewed', Buffer.from(jsonMsg)); // Publish message to the "viewed" queue.
}

//
// Setup route handlers.
//
async function setupHandlers(
	app: Application,
	db: Db,
	messageChannel: amqp.Channel
) {
	const videosCollection = db.collection('videos');
	//
	// Registers a HTTP GET route for video streaming.
	//
	app.get('/video', (req: express.Request, res: express.Response) => {
		const videoId = new ObjectId(req.query.id as string);
		videosCollection
			.findOne({_id: videoId})
			.then((videoRecord) => {
				if (!videoRecord) {
					res.sendStatus(404);
					return;
				}

				console.log(
					`Translated id ${videoId} to path ${videoRecord.videoPath}.`
				);

				const forwardRequest = http.request(
					// Forward the request to the video storage microservice.
					{
						host: VIDEO_STORAGE_HOST,
						port: VIDEO_STORAGE_PORT,
						path: `/video?path=${videoRecord.videoPath}`,
						method: 'GET',
						headers: req.headers,
					},
					(forwardResponse) => {
						res.writeHead(
							forwardResponse.statusCode as number,
							forwardResponse.headers
						);
						forwardResponse.pipe(res);
						sendViewedMessage(
							messageChannel,
							videoRecord.videoPath
						);
					}
				);

				req.pipe(forwardRequest);
			})
			.catch((err) => {
				console.error('Database query failed.');
				console.error((err && err.stack) || err);
				res.sendStatus(500);
			});
	});
}

//
// Start the HTTP server.
//
function startHttpServer(db: Db, messageChannel: amqp.Channel) {
	// Wrap in a promise so we can be notified when the server has started.
	return new Promise<void>((resolve) => {
		const app = express();
		setupHandlers(app, db, messageChannel);

		app.listen(PORT || 3000, () => {
			resolve(); // HTTP server is listening, resolve the promise.
		});
	});
}

//
// Application entry point.
//
async function main() {
	console.log('Hello world!');
	// Connect to the database...
	const db = await connectDb();
	// connect to RabbitMQ...
	const messageChannel = await connectRabbit();
	return startHttpServer(db, messageChannel);
}

main()
	.then(() => console.log('Microservice online.'))
	.catch((err) => {
		console.error('Microservice failed to start.');
		console.error((err && err.stack) || err);
	});
