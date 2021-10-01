import express from 'express';
import fs from 'fs';
import path from 'path';
import azurestorage from 'azure-storage';
const app = express();

if (!process.env.PORT) {
	throw new Error(
		'Please specify the port number for the HTTP server with the environment variable PORT.'
	);
}

if (!process.env.STORAGE_ACCOUNT_NAME) {
	throw new Error(
		'Please specify the name of an Azure storage account in environment variable STORAGE_ACCOUNT_NAME.'
	);
}

if (!process.env.STORAGE_ACCESS_KEY) {
	throw new Error(
		'Please specify the access key to an Azure storage account in environment variable STORAGE_ACCESS_KEY.'
	);
}

//
// Extracts environment variables to globals for convenience.
//

const PORT = process.env.PORT;
const STORAGE_ACCOUNT_NAME = process.env.STORAGE_ACCOUNT_NAME;
const STORAGE_ACCESS_KEY = process.env.STORAGE_ACCESS_KEY;

console.log(`Serving videos from Azure storage account ${STORAGE_ACCOUNT_NAME}.`);

//
// Create the Blob service API to communicate with Azure storage.
//
function createBlobService() {
    const blobService = azurestorage.createBlobService(
		STORAGE_ACCOUNT_NAME,
		STORAGE_ACCESS_KEY
	);
    // Uncomment next line for extra debug logging.
    //blobService.logger.level = azure.Logger.LogLevels.DEBUG; 
    return blobService;
}

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

//
// Registers a HTTP GET route to retrieve videos from storage.
//
app.get("/video", (req: express.Request, res: express.Response) => {
    const videoPath = req.query.path as string;
    console.log(`Streaming video from path ${videoPath}.`);
    
    const blobService = createBlobService();

    const containerName = "videos";
    // Sends a HTTP HEAD request to retreive video size.
    blobService.getBlobProperties(containerName, videoPath, (err, properties) => { 
        if (err) {
            console.error(`Error occurred getting properties for video ${containerName}/${videoPath}.`);
            console.error(err && err.stack || err);
            res.sendStatus(500);
            return;
        }

        //
        // Writes HTTP headers to the response.
        //
        res.writeHead(200, {
            "Content-Length": properties.contentLength,
            "Content-Type": "video/mp4",
        });

        //
        // Streams the video from Azure storage to the response.
        //
        blobService.getBlobToStream(containerName, videoPath, res, err => {
            if (err) {
                console.error(`Error occurred getting video ${containerName}/${videoPath} to stream.`);
                console.error(err && err.stack || err);
                res.sendStatus(500);
                return;
            }
        });
    });
});

app.listen(PORT, () => {
	console.log(
		`Microservice listening on port ${PORT}, point your browser at http://localhost:${PORT}/video`
	);
});
