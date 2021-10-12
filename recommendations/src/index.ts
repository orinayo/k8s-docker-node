import express, {Application} from 'express';
import {json} from 'body-parser';
import {MongoClient, Db} from 'mongodb';
import amqp from 'amqplib';

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

const DBHOST = process.env.DBHOST;
const DBNAME = process.env.DBNAME;
const RABBIT = process.env.RABBIT;

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
	return connection.createChannel();
}

//
// Setup event handlers.
//
async function setupHandlers(
	app: Application,
	db: Db,
	messageChannel: amqp.Channel
) {
	const videosCollection = db.collection('videos');

	// ... YOU CAN PUT HTTP ROUTES AND OTHER MESSAGE HANDLERS HERE ...

	async function consumeViewedMessage(msg: amqp.ConsumeMessage | null) {
		if (msg) {
			// Handler for coming messages.
			console.log("Received a 'viewed' message");

			const parsedMsg = JSON.parse(msg.content.toString()); // Parse the JSON message.
			// JUST PRINTING THE RECEIVED MESSAGE.
			console.log(JSON.stringify(parsedMsg, null, 4));

			await videosCollection.insertOne({videoPath: parsedMsg.videoPath}); // Record the "view" in the database.
			console.log('Acknowledging message was handled.');
			messageChannel.ack(msg); // If there is no error, acknowledge the message.
		}
	}

	await messageChannel.assertExchange('viewed', 'fanout'); // Assert that we have a "viewed" exchange.
	const response = await messageChannel.assertQueue('', {exclusive: true});
	const queueName = response.queue;
	console.log(`Created queue ${queueName}, binding it to "viewed" exchange.`);
	await messageChannel.bindQueue(queueName, 'viewed', ''); // Bind the queue to the exchange.
	return messageChannel.consume(queueName, consumeViewedMessage);
}

//
// Start the HTTP server.
//
function startHttpServer(db: Db, messageChannel: amqp.Channel) {
	// Wrap in a promise so we can be notified when the server has started.
	return new Promise<void>((resolve) => {
		const app = express();
		app.use(json()); // Enable JSON body for HTTP requests.
		setupHandlers(app, db, messageChannel);

		const port = (process.env.PORT && parseInt(process.env.PORT)) || 3000;
		app.listen(port, () => {
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
