const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const { MongoClient, ServerApiVersion } = require('mongodb');
const morgan = require('morgan')
const port = process.env.PORT || 5000;


// middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'))



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.j0hxo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

	const db = client.db('scholarship-session');
	const usersCollection = db.collection('users');

  // jwt related api
  app.post('/jwt', async (req, res) => {
	const user = req.body;
	const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
	res.send({ token });
  })

   // middlewares 
   const verifyToken = (req, res, next) => {
	// console.log('inside verify token', req.headers.authorization);
	if (!req.headers.authorization) {
	  return res.status(401).send({ message: 'unauthorized access' });
	}
	const token = req.headers.authorization.split(' ')[1];
	jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
	  if (err) {
		return res.status(401).send({ message: 'unauthorized access' })
	  }
	  req.decoded = decoded;
	  next();
	})
  };

    // use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
		const email = req.decoded.email;
		const query = { email: email };
		const user = await usersCollection.findOne(query);
		const isAdmin = user?.role === 'admin';
		if (!isAdmin) {
		  return res.status(403).send({ message: 'forbidden access' });
		}
		next();
	  };


	  //users related api

	  //save or update user in db
	  app.post('/users/:email', async(req, res) =>{

		const email = req.params.email;
		const query = { email};
		const user = req.body;
		console.log(user);
		
		//check if user exists in db
		const isExist = await usersCollection.findOne(query);
  
		  if(isExist){
			return res.send(isExist);
		  }
  
		const result = await usersCollection.insertOne({
		//   name: user?.image,
		//   email: user?.email,
		//   image: user?.image,
		...user,
		  role: 'student',
		  timestamp: Date.now()});
		res.send(result);
	  })





    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


//

app.get('/', (req, res) => {
	res.send('assignment 12 running')
})
  
app.listen(port, () => {
	console.log(`Assignment 12 on port ${port}`);
})