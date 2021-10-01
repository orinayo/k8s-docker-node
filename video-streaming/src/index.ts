import express from 'express';
import http from 'http';
import {MongoClient, ObjectId} from 'mongodb';

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

//
// Extracts environment variables to globals for convenience.
//
const PORT = process.env.PORT;
const VIDEO_STORAGE_HOST = process.env.VIDEO_STORAGE_HOST;
const VIDEO_STORAGE_PORT = parseInt(process.env.VIDEO_STORAGE_PORT);
const DBHOST = process.env.DBHOST;
const DBNAME = process.env.DBNAME;
console.log(
	`Forwarding video requests to ${VIDEO_STORAGE_HOST}:${VIDEO_STORAGE_PORT}.`
);

async function main() {
	// Connect to the database.
	const client = await MongoClient.connect(DBHOST);
	const db = client.db(DBNAME);
	const videosCollection = db.collection('videos');
	//
	// Registers a HTTP GET route for video streaming.
	//
	app.get('/video', (req_1: express.Request, res: express.Response) => {
		const videoId = new ObjectId(req_1.query.id as string);
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
						headers: req_1.headers,
					},
					(forwardResponse) => {
						res.writeHead(
							forwardResponse.statusCode as number,
							forwardResponse.headers
						);
						forwardResponse.pipe(res);
					}
				);

				req_1.pipe(forwardRequest);
			})
			.catch((err) => {
				console.error('Database query failed.');
				console.error((err && err.stack) || err);
				res.sendStatus(500);
			});
	});
	//
	// Starts the HTTP server.
	//
	app.listen(PORT, () => {
		console.log(
			`Microservice listening, please load the data file db-fixture/videos.json into your database before testing this microservice.`
		);
	});
}

main()
	.then(() => console.log('Microservice online.'))
	.catch((err) => {
		console.error('Microservice failed to start.');
		console.error((err && err.stack) || err);
	});
