import { MongoClient, MongoClientOptions } from 'mongodb';
declare global {
    var _mongoClientPromise: Promise<MongoClient> | undefined;
}
const uri = process.env.MONGODB_URI;
if (!uri) {
    throw new Error('Please add your Mongo URI to .env');
}
const options: MongoClientOptions = {
    maxPoolSize: 10,
    minPoolSize: 5,
    retryWrites: true,
    w: 'majority',
};
let clientPromise: Promise<MongoClient>;
if (process.env.NODE_ENV === 'development') {
    // In development mode, use a global variable so that the value
    // is preserved across module reloads caused by HMR (Hot Module Replacement).
    if (!global._mongoClientPromise) {
        const client = new MongoClient(uri, options);
        global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
}
else {
    // In production mode, it's best to not use a global variable.
    const client = new MongoClient(uri, options);
    clientPromise = client.connect();
}
export default clientPromise;
