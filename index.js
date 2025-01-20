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
	const reviewCollection = db.collection('reviews');

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
	 // top Scholarships endpoint

		app.get('/top-scholarships', async (req, res) => {
			try {
			const topScholarships = await scholarshipCollection.aggregate([
				// Step 1: Sort by application fees (ascending) and post date (descending)
				{
				$sort: {
					applicationFees: 1, // Low application fees first
					postDate: -1        // Recently posted first
				}
				},
				// Step 2: Limit to 6 scholarships
				{ $limit: 6 },
				// Step 3: Lookup reviews to calculate average rating
				{
				$lookup: {
					from: 'reviews', // Name of the review collection
					let: { scholarshipId: "$_id" }, // Pass scholarship _id
					pipeline: [
					{
						$match: {
						$expr: {
							$eq: ["$scholarshipId", { $toString: "$$scholarshipId" }] // Convert _id to string
						}
						}
					}
					],
					as: 'reviews'
				}
				},
				// Step 4: Add a field for the average rating
				{
				$addFields: {
					averageRating: {
					$avg: { $map: { input: "$reviews", as: "review", in: { $toDouble: "$$review.rating" } } }
					}
				}
				},
				// Step 5: Project necessary fields
				{
				$project: {
					scholarshipName: 1,
					universityName: 1,
					image: 1,
					universityCountry: 1,
					universityCity: 1,
					universityRank: 1,
					subjectCategory: 1,
					scholarshipCategory: 1,
					degreeCategory: 1,
					tuitionFees: 1,
					applicationFees: 1,
					applicationDeadline: 1,
					postDate: 1,
					averageRating: 1
				}
				}
			]).toArray();
		
			res.status(200).send(topScholarships);
			} catch (error) {
			console.error("Error fetching top scholarships:", error);
			res.status(500).send({ message: "Failed to fetch top scholarships" });
			}
		});

		// all Scholarships endpoint

		app.get('/all-scholarships', async (req, res) => {
			try {
			const topScholarships = await scholarshipCollection.aggregate([
				
				// Lookup reviews to calculate average rating
				{
				$lookup: {
					from: 'reviews', // Name of the review collection
					let: { scholarshipId: "$_id" }, // Pass scholarship _id
					pipeline: [
					{
						$match: {
						$expr: {
							$eq: ["$scholarshipId", { $toString: "$$scholarshipId" }] // Convert _id to string
						}
						}
					}
					],
					as: 'reviews'
				}
				},
				// Add a field for the average rating
				{
				$addFields: {
					averageRating: {
					$avg: { $map: { input: "$reviews", as: "review", in: { $toDouble: "$$review.rating" } } }
					}
				}
				},
				//Project necessary fields
				{
				$project: {
					scholarshipName: 1,
					universityName: 1,
					image: 1,
					universityCountry: 1,
					universityCity: 1,
					universityRank: 1,
					subjectCategory: 1,
					scholarshipCategory: 1,
					degreeCategory: 1,
					tuitionFees: 1,
					applicationFees: 1,
					applicationDeadline: 1,
					postDate: 1,
					averageRating: 1
				}
				}
			]).toArray();
		
			res.status(200).send(topScholarships);
			} catch (error) {
			console.error("Error fetching top scholarships:", error);
			res.status(500).send({ message: "Failed to fetch top scholarships" });
			}
		});

	  //save a scholarship data in db
	  app.post('/scholarships', verifyToken, async(req, res) =>{
		const scholarship = req.body;
		const result = await scholarshipCollection.insertOne(scholarship);
		res.send(result);
	  });

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

		// Cancel a scholarship application
		app.patch("/apply-scholarship/cancel/:id", async (req, res) => {
			try {
			const { id } = req.params;
			const filter = { _id: new ObjectId(id) };
			const updatedDoc = {
				 $set: { status: "rejected" }
			}
		
			const result = await applyScholarshipCollection.updateOne(filter, updatedDoc);
		
			if (result.modifiedCount === 0) {
				return res.status(404).send({ error: "Scholarship not found or not canceled" });
			}
		
			res.send({ message: "Scholarship application canceled successfully" });
			} catch (error) {
			console.error("Error canceling scholarship:", error);
			res.status(500).send({ error: "Failed to cancel scholarship" });
			}
		});

		// Update Application Status
		app.patch('/update-status/:id', async (req, res) => {
			const { id } = req.params; // Application ID
			const { status } = req.body; // New status from the request body
		
			// Validate the status
			const validStatuses = ["pending", "processing", "completed", "reject"];
			if (!validStatuses.includes(status)) {
			return res.status(400).send({ message: "Invalid status value" });
			}
		
			try {
			// Update the application status in the database
			const result = await applyScholarshipCollection.updateOne(
				{ _id: new ObjectId(id) },
				{ $set: { status } }
			);
		
			if (result.modifiedCount === 1) {
				res.status(200).send({ message: "Application status updated successfully" });
			} else {
				res.status(404).send({ message: "Application not found" });
			}
			} catch (error) {
			console.error("Error updating status:", error);
			res.status(500).send({ message: "Failed to update application status" });
			}
		});
	  
		// Add feedback to a scholarship
		app.patch("/apply-scholarship/:id/feedback", async (req, res) => {
			try {
			const { id } = req.params;
			const { feedback } = req.body;
		
			if (!feedback) {
				return res.status(400).send({ error: "Feedback is required" });
			}
		
			const result = await applyScholarshipCollection.updateOne(
				{ _id: new ObjectId(id) },
				{ $set: { feedback } }
			);
		
			if (result.modifiedCount === 0) {
				return res.status(404).send({ error: "Scholarship not found or feedback not updated" });
			}
		
			res.send({ message: "Feedback added successfully" });
			} catch (error) {
			console.error("Error adding feedback:", error);
			res.status(500).send({ error: "Failed to add feedback" });
			}
		});


		// review collection related api_________________
		// Save review data in the database
		app.post('/add-review', verifyToken, async (req, res) => {
			const reviewData = req.body; // Contains review details like scholarshipId, userEmail, etc.
			const { userEmail, scholarshipId } = reviewData;
		  
			try {
			  // Check if a review from the same user for the same scholarshipId already exists
			  const existingReview = await reviewCollection.findOne({ userEmail, scholarshipId });
		  
			  if (existingReview) {
				return res.status(400).send({ 
				  message: "You have already submitted a review for this scholarship." 
				});
			  }
		  
			  // Insert the new review if no existing review is found
			  const result = await reviewCollection.insertOne(reviewData);
			  res.status(201).send(result); // Successfully created
			} catch (error) {
			  console.error("Error saving review data:", error);
			  res.status(500).send({ message: "Failed to save review data" });
			}
		  });
		  

		  // GET api to fetch reviews for a specific scholarship
		app.get('/reviews/:scholarshipId', async (req, res) => {
			try {
				const { scholarshipId } = req.params;
				const reviews = await reviewCollection
				.find({ scholarshipId: scholarshipId })
				.toArray();

				res.status(200).send(reviews);
			} catch (error) {
				console.error('Error fetching reviews:', error);
				res.status(500).json({ message: 'Internal server error.' });
			}
		});

		//all review page review collection
		// Fetch all reviews
		app.get("/all-reviews", verifyToken, async (req, res) => {
			try {
			const reviews = await reviewCollection.find().toArray();
			res.status(200).send(reviews);
			} catch (error) {
			res.status(500).json({ error: "Failed to fetch reviews" });
			}
		});

		// Delete a review
		app.delete("/all-reviews/:id", async (req, res) => {
			try {
			const { id } = req.params;
			const result = await reviewCollection.deleteOne({ _id: new ObjectId(id) });
		
			if (result.deletedCount === 1) {
				res.status(200).json({ message: "Review deleted successfully" });
			} else {
				res.status(404).json({ error: "Review not found" });
			}
			} catch (error) {
			res.status(500).json({ error: "Failed to delete review" });
			}
		});

		//my review page api______________
		//when use verifyToken then api not work
		// app.get("/reviews",  async (req, res) => {
		// 	try {
		// 	  const email = req.query.email; // Extract email from query parameters
		// 	  if (!email) {
		// 		return res.status(400).send({ message: "Email is required" });
		// 	  }
		// 	  const query = { userEmail: email }; // Match userEmail with the query
		// 	  console.log("Fetching reviews for email:", email);
		  
		// 	  const reviews = await reviewCollection.find(query).toArray(); // Fetch reviews
		// 	  console.log("Reviews found:", reviews);
		  
		// 	  res.send(reviews); // Send the reviews back as response
		// 	} catch (error) {
		// 	  console.error("Error fetching reviews:", error);
		// 	  res.status(500).send({ message: "Failed to fetch reviews" });
		// 	}
		//   });


		//admin-stats api
		  
		  
		app.get('/admin-stats', async (req, res) => {
			try {
				// Count documents in different collections
				const users = await usersCollection.estimatedDocumentCount();
				const applications = await applyScholarshipCollection.estimatedDocumentCount();
				const scholarships = await scholarshipCollection.estimatedDocumentCount();
				const reviews = await reviewCollection.estimatedDocumentCount();
		
				// Aggregate subject categories (e.g., Agriculture, Engineering, etc.)
				const subjectCategoriesAggregation = await scholarshipCollection.aggregate([
					{ $match: { subjectCategory: { $exists: true, $ne: null } } }, // Only consider valid subject categories
					{ $group: { _id: "$subjectCategory", count: { $sum: 1 } } },
					{ $project: { _id: 0, subjectCategory: "$_id", count: 1 } }
				]).toArray();
		
				const subjectCategories = subjectCategoriesAggregation.reduce((acc, curr) => {
					acc[curr.subjectCategory] = curr.count;
					return acc;
				}, {});
		
				res.send({
					users,
					applications,
					scholarships,
					reviews,  
					subjectCategories    // Subject categories object (Agriculture, Engineering, etc.)
				});
			} catch (error) {
				console.error('Error fetching admin stats:', error);
				res.status(500).send({ error: 'Failed to fetch admin stats' });
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