import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const R2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export default async function handler(req, res) {
  const { path } = req.query;
  
  const fileKey = Array.isArray(path) ? path.join('/') : path;

  if (!fileKey) {
    return res.status(404).send('File path missing');
  }

  try {
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey,
    });

    const response = await R2.send(command);

    if (response.ContentType) {
      res.setHeader('Content-Type', response.ContentType);
    }
    if (response.ETag) {
      res.setHeader('ETag', response.ETag);
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    const byteArray = await response.Body.transformToByteArray();
    return res.status(200).send(Buffer.from(byteArray));

  } catch (error) {
    console.error(error);
    if (error.name === 'NoSuchKey') {
      return res.status(404).send('Image not found in R2');
    }
    return res.status(500).send('Internal Server Error');
  }
}