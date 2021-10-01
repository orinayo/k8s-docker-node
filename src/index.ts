import express from 'express';
import fs from 'fs';
import path from 'path';
const app = express();

// if (!process.env.PORT) {
// 	throw new Error(
// 		'Please specify the port number for the HTTP server with the environment variable PORT.'
// 	);
// }

const PORT = 3000;

//
// Registers a HTTP GET route for video streaming.
//
app.get('/video', (_, res: express.Response) => {
	const videoPath = path.join('./videos', 'SampleVideo_1280x720_1mb.mp4');
	fs.stat(videoPath, (err, stats) => {
		if (err) {
			console.error('An error occurred ');
			res.sendStatus(500);
			return;
		}

		res.writeHead(200, {
			'Content-Length': stats.size,
			'Content-Type': 'video/mp4',
		});
		fs.createReadStream(videoPath).pipe(res);
	});
});

app.listen(PORT, () => {
	console.log(
		`Microservice listening on port ${PORT}, point your browser at http://localhost:${PORT}/video`
	);
});
