const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const morgan = require('morgan');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
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
	const scholarshipCollection = db.collection('scholarships');
	const applyScholarshipCollection = db.collection('applyScholarships');

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
		const email = req.user?.email;
		const query = { email };
		const result = await usersCollection.findOne(query);

		if (!result || result?.role !== 'admin') {
		  return res.status(403).send({ message: 'forbidden access! Admin Only Actions' });
		}
		next();
	  };

    // use verify admin after verifyToken
    const verifyModerator = async (req, res, next) => {
		const email = req.user?.email;
		const query = { email };
		const result = await usersCollection.findOne(query);

		if (!result || result?.role !== 'moderator') {
		  return res.status(403).send({ message: 'forbidden access! Moderator Only Actions' });
		}
		next();
	  };



	  //users related api____________________

	  //save or update user in db
	  app.post('/users/:email', async(req, res) =>{

		const email = req.params.email;
		const query = { email};
		const user = req.body;
		// console.log(user);
		
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
	  });

	  //manage user status and role api
	  app.patch('/users/:email', verifyToken, async(req, res) =>{
		const email = req.params.email;
		const query = { email};
		const user = await usersCollection.findOne(query);  
		
		if(!user || user?.status === 'Requested')
			return res
					.status(409)
					.send('You have already requested wait for some time.')
		
		const updatedDoc = {
			$set: {
				status: 'Requested',
			},
		}

		const result = await usersCollection.updateOne(query, updatedDoc);
		res.send(result);
	  });


	  //get user role
	  app.get('/users/role/:email', async(req, res) =>{
		const email = req.params.email;
		const result = await usersCollection.findOne({email});
		res.send({ role: result?.role})

	  });

	  //get all user data
	  app.get('/all-users/:email', verifyToken, async(req, res) =>{
		const email = req.params.email;
		const query = { email: { $ne: email}};
		const result = await usersCollection.find(query).toArray();
		res.send(result);
	  });


	  //update a user role
	  app.patch('/user/role/:email', verifyToken, async(req, res) =>{
		const email = req.params.email;
		const { role } = req.body;
		const filter = { email };
		const updatedDoc = {
			$set: { role },
		};
		const result = await usersCollection.updateOne(filter, updatedDoc);
		res.send(result);
	  });

	  //delete user related api
		app.delete('/user/:id', verifyToken, async(req, res) =>{
			const id = req.params.id;
			const query = { _id: new ObjectId(id)};
			const result = await usersCollection.deleteOne(query);
			res.send(result);
			});

	  
	  //add scholarship data____________________

	  //save a scholarship data in db
	  app.post('/scholarships', verifyToken, async(req, res) =>{
		const scholarship = req.body;
		const result = await scholarshipCollection.insertOne(scholarship);
		res.send(result);
	  })

	  //get all scholarships data from db
	  app.get('/scholarships', async(req, res) =>{
		const result = await scholarshipCollection.find().limit(20).toArray();
		res.send(result);
	  });

	  // get a scholarships details by id
	  app.get('/scholarships/:id', async(req, res) =>{
		const id = req.params.id;
		const query = { _id: new ObjectId(id)};
		const result = await scholarshipCollection.findOne(query);
		res.send(result);
	  });


	  //moderator and admin manage scholarship page api_________
	  //delete manage scholarship related api

		app.delete('/scholarship/:id', verifyToken, async(req, res) =>{
			const id = req.params.id;
			const query = { _id: new ObjectId(id)};
			const result = await scholarshipCollection.deleteOne(query);
			res.send(result);
			});
		
	//update scholarship modal api - manage scholarship page

	app.put('/edit-manage-scholarship/:id', verifyToken, async (req, res) => {
		const item = req.body;
		console.log(item);
		const id = req.params.id;
		const filter = { _id: new ObjectId(id) };
		const updatedDoc = {
		  $set: {
			scholarshipName: item?.scholarshipName,
			universityName: item?.universityName,
			universityCountry: item?.universityCountry,
			universityCity: item?.universityCity,
			universityRank: item?.universityRank,
			universityCity: item?.universityCity,
			tuitionFees: item?.tuitionFees,
			applicationFees: item?.applicationFees,
			serviceCharge: item?.serviceCharge,
			applicationDeadline: item?.applicationDeadline,
			postDate: item?.postDate,
			subjectCategory: item?.subjectCategory,
			scholarshipCategory: item?.scholarshipCategory,
			degreeCategory: item?.degreeCategory,
			image: item?.image,
			postedUserEmail: item?.postedUserEmail,
		  },
		};
	  
		try {
		  const result = await scholarshipCollection.updateOne(filter, updatedDoc);
	  
		  if (result.matchedCount === 0) {
			// Document not found
			return res.status(404).send({ message: 'scholarship not found', success: false });
		  }
	  
		  if (result.modifiedCount === 0) {
			// No changes made
			return res.status(200).send({ message: 'No changes were made', success: true });
		  }
	  
		  // Successful update
		  res.status(200).send({ message: 'scholarship updated successfully', success: true });
		} catch (error) {
		  console.error('Error updating scholarship:', error);
		  res.status(500).send({ message: 'Failed to update the scholarship', success: false });
		}
	  });

	  //my application page related api___________

	  //save applyScholarship data in db
	  app.post('/apply-scholarship', verifyToken, async(req, res) =>{
		const applyScholarshipInfo = req.body;
		const result = await applyScholarshipCollection.insertOne(applyScholarshipInfo);
		res.send(result);
	  });

	  //get my application for a specific student
	  app.get('/apply-scholarship/:email',  verifyToken, async(req, res) =>{
		const email = req.params.email;
		const query = { 'student.userEmail': email};
		const result = await applyScholarshipCollection.find(query).toArray();
		// console.log(result);
		res.send(result);
	  });

	  //cancel my application api
	  app.delete('/my-application/:id', verifyToken, async(req, res) =>{
		const id = req.params.id;
		const query = { _id: new ObjectId(id)};
		const result = await applyScholarshipCollection.deleteOne(query);
		res.send(result);
	  });

	  //edit my application page api
	  app.get('/edit-my-application/:id', verifyToken, async(req, res) =>{
		const id = req.params.id;
		const query = { _id: new ObjectId(id)};
		const result = await applyScholarshipCollection.findOne(query);
		res.send(result);
	  });
	  
	  //edit my application page patch request api

	  app.patch('/edit-my-application/:id', async (req, res) => {
		const item = req.body;
		const id = req.params.id;
		const filter = { _id: new ObjectId(id) };
		const updatedDoc = {
		  $set: {
			phone: item.phone,
			photo: item.photo,
			village: item.studentAddress?.village,
			district: item.studentAddress?.district,
			country: item.studentAddress?.country,
			gender: item.gender,
			degree: item.degree,
			sscResult: item.sscResult,
			hscResult: item.hscResult,
			studyGap: item.studyGap,
		  },
		};
	  
		try {
		  const result = await applyScholarshipCollection.updateOne(filter, updatedDoc);

		  if(result.status === 'processing')
			return res
		  			.status(409)
					.send('cannot update once the application is processing')
	  
		  if (result.matchedCount === 0) {
			// Document not found
			return res.status(404).send({ message: 'Application not found', success: false });
		  }
	  
		  if (result.modifiedCount === 0) {
			// No changes made
			return res.status(200).send({ message: 'No changes were made', success: true });
		  }
	  
		  // Successful update
		  res.status(200).send({ message: 'Application updated successfully', success: true });
		} catch (error) {
		  console.error('Error updating application:', error);
		  res.status(500).send({ message: 'Failed to update the application', success: false });
		}
	   });

	   //all applied scholarship page___________
	   //get all applied scholarship data from applyScholarships collection
		app.get("/apply-scholarships", async (req, res) => {
			try {
			const { status } = req.query; // Optional filter for status
			const filter = {};
			if (status) filter.status = status;
		
			const scholarships = await applyScholarshipCollection.find(filter).toArray();
			res.send(scholarships);
			} catch (error) {
			console.error("Error fetching scholarships:", error);
			res.status(500).send({ error: "Failed to fetch scholarships" });
			}
		});
	  



	  //payment related_______________
	  //payment intent
	  app.post('/create-payment-intent', async(req, res) =>{
		const { applicationFees } = req.body;
		const amount = parseInt(applicationFees * 100);

		const paymentIntent = await stripe.paymentIntents.create({
			amount: amount,
			currency: 'usd',
			payment_method_types: ['card']
		});

		res.send({
			clientSecret: paymentIntent.client_secret
		})
	  });

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