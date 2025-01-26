require('dotenv').config();
const stripe =new require("stripe")(process.env.STRIPE_SECRET_KEY);
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId, Timestamp } = require('mongodb');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');

const port = process.env.PORT || 5000;
const app = express();

// Middleware
const corsOptions = {
  // Adjust origins as needed
  origin: 'http://localhost:5173',
  credentials: true,
  optionSuccessStatus: 200,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT','PATCH', 'DELETE'], 
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));


//
//verifyToken
const verifyToken = (req, res, next) => {
  
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      // console.log("Missing Authorization Header");
      return res.status(401).send({ message: 'Unauthorized access' });
    }
  
    const token = authHeader.split(' ')[1];
    // console.log('Extracted Token:', token);
  
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) {
        // console.error("JWT Verification Error:", err);
        return res.status(401).send({ message: 'Unauthorized access' });
      }
  
      req.decoded = decoded;
      next();
    });
  };

      // JWT Token Creation
app.post('/jwt', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).send({ message: 'Email is required' });
    }

    const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: '365d',
    });

    res.send({ success: true, token }); // Send token in the response body
  } catch (error) {
    res.status(500).send({ message: 'Internal server error' });
  }
});


 
    // Logout
app.get('/logout', (req, res) => {
  try {
    res.clearCookie('token', {
      maxAge: 0,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    }).send({ success: true });
  } catch (err) {
    res.status(500).send(err);
  }
});

  


// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hvkkh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    
  //all the collection of database
    const db=client.db('EduConnect');
    const userCollection=db.collection('users');
    const classesCollection=db.collection('classes');
    const teacherReqCollection=db.collection('teacher-req');
    const paymentsCollection=db.collection('payments')
    
    //verifyAdmin
    const verifyAdmin=async(req,res,next)=>{
      const email=req.decoded.email;
      const query={email:email};
      const user=await userCollection.findOne(query);
      const isAdmin=user?.role === 'admin';
      if(!isAdmin){
        return res.status(401).send({message: 'forbidden access'})
      }
      next();
    }
    

//

    //save a user 
    app.post('/users/:email',async(req,res)=>{
      const email=req.params.email
      const query={email}
      const user=req.body
      //check if user is already in db or not 
      isExist=await userCollection.findOne(query)
      if(isExist){
        return res.send(isExist)
      }
      const result=await userCollection.insertOne({...user,
        role: "Student",
        timestamp: Date.now()})
      res.send(result)
    })

 

    // Get all the users
  app.get('/users',verifyToken,verifyAdmin, async (req, res) => {
  const result = await userCollection.find().toArray();
  res.send(result);
});


// Get user data by email
app.get('/user', verifyToken, async (req, res) => {
  try {
    const email = req.decoded.email; // Extract email from the verified token
    const query = { email: email };
    
    const user = await userCollection.findOne(query); // Find user by email
    
    if (!user) {
      return res.status(404).send({ message: 'User not found' });
    }

    res.send(user); // Send user data as response
  } catch (error) {
    console.error('Error retrieving user data:', error);
    res.status(500).send({ message: 'Internal server error' });
  }
});


//admin verify route
  app.get('/users/admin/:email',verifyToken, async (req, res) => {
  const email=req.params.email;
  if(email !== req.decoded.email){
    return res.status(403).send({message: "unauthorized access"})
  }
  const query={email:email};
  const user=await userCollection.findOne(query);
  let admin=false;
  if(email){
    admin = user.role === 'admin';
  }
  res.send({admin});
});

// 

// Search users by username or email
app.get('/users/search', async (req, res) => {
  const query = req.query.query;
  const result = await userCollection.find({
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { email: { $regex: query, $options: 'i' } }
    ]
  }).toArray();
  res.send(result);
});

// Make a user admin
app.patch('/users/admin/:id',verifyToken,verifyAdmin, async (req, res) => {
  const id = req.params.id;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = {
    $set: { role: 'admin' }
  };
  const result = await userCollection.updateOne(filter, updateDoc);
  res.send(result);
});





// Approve a class

app.patch('/allClasses/approve/:id', async (req, res) => {
  const id = req.params.id;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = {
    $set: { status: 'approved' }
  };
  const result = await classesCollection.updateOne(filter, updateDoc);
  res.send(result);
});

// reject class/
app.patch('/allClasses/rejected/:id', async (req, res) => {
  const id = req.params.id;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = {
    $set: { status: 'rejected' }
  };
  const result = await classesCollection.updateOne(filter, updateDoc);
  res.send(result);
});





// Delete a user
app.delete('/users/:id',verifyToken,verifyAdmin, async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const result = await userCollection.deleteOne(query);
  res.send(result);
});


// send teacher-req on db 
app.post('/teacher-req',verifyToken,async(req,res)=>{
  const data=req.body
  const result=await teacherReqCollection.insertOne({...data,status:'pending'})
  res.send(result)
})

//get all the teacher req
app.get("/teacher-req",verifyToken,  async (req, res) => {
        const result = await teacherReqCollection.find().toArray();
        res.send(result);
      });


//


app.patch('/teacher-req/approve/:id',verifyToken, async (req, res) => {
  const id = req.params.id;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = {
    $set: { status: 'approved' }
  };
  const result = await teacherReqCollection.updateOne(filter, updateDoc);
  res.send(result);
});

// reject class/
app.patch('/teacher-req/rejected/:id', async (req, res) => {
  const id = req.params.id;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = {
    $set: { status: 'rejected' }
  };
  const result = await teacherReqCollection.updateOne(filter, updateDoc);
  res.send(result);
});


      

//
    //send classes to db
    app.post('/class',async(req,res)=>{
      const classs=req.body
      const result=await classesCollection.insertOne({...classs,status:'Pending'})
      res.send(result)
    })

    //get My all classes teacher
    app.get('/myClasses',verifyToken,async(req,res)=>{
     
      const result=await classesCollection.find().toArray()
      res.send(result)
    })

    //delete class
    app.delete('/class/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const result = await classesCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount > 0) {
          res.status(200).json({ message: 'Class deleted successfully' });
        } else {
          res.status(404).json({ message: 'Class not found' });
        }
      } catch (error) {
        res.status(500).json({ message: 'Failed to delete class', error });
      }
    });


// Update a specific class by ID
app.put('/class/:id',verifyToken, async (req, res) => {
  const { id } = req.params;
  const updatedClassData = req.body;

  try {
    const result = await classesCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedClassData }
    );

    if (result.modifiedCount > 0) {
      res.status(200).send({ message: 'Class updated successfully' });
    } else {
      res.status(404).send({ message: 'Class not found or no changes made' });
    }
  } catch (error) {
    res.status(500).send({ message: 'Failed to update class', error });
  }
});

  

//get all classes public route
    app.get('/allClasses',async(req,res)=>{
     
      const result=await classesCollection.find().toArray()
      res.send(result)
    })


    //get single class details by id
    app.get('/class/:id', async (req, res) => {
      const { id } = req.params;
      try {
        const result = await classesCollection.findOne({ _id: new ObjectId(id) });
        if (result) {
          res.send(result);
        } else {
          res.status(404).send({ message: 'Class not found' });
        }
      } catch (error) {
        res.status(500).send({ message: 'Internal server error' });
      }
    });
    


//payment system/

    app.post("/create-payment-intent/:id", async (req, res) => {
      try {
        const { price } = req.body; // Get price from request body
        const id = req.params.id; // Get class ID from URL params
        const query = { _id: new ObjectId(id) };

        const TeacherClass = await classesCollection.findOne(query);
        if (!TeacherClass) {
          return res.status(404).send({ error: "Class not found" });
        }
        const amount = parseInt(price * 100);
        // console.log(amount, "amount inside the intent");

        // Create the payment intent
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
        const updatedDoc = {
          $set: {
            enroll: (TeacherClass.enroll || 0) + 1, // If enroll doesn't exist, start from 0
          },
        };
        const updRes = await classesCollection.updateOne(
          query,
          updatedDoc
        );
        if (updRes.modifiedCount === 0) {
          return res
            .status(500)
            .send({ error: "Failed to update enrollment count" });
        }
        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        // console.error("Error in /create-payment-intent:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

//send money to database
    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const payResult = await paymentsCollection.insertOne(payment);
      // console.log("payment info", payment);
      res.send(payResult);
    });

    // get my enroll data from payments collection 
    app.get('/my-enrolled-class', async (req, res) => {
      const result=await paymentsCollection.find().toArray()
      res.send(result)
    });

    







    // Ping MongoDB
    await client.db('admin').command({ ping: 1 });
    console.log('Pinged your deployment. You successfully connected to MongoDB!');
  } finally {
    // Cleanup if needed
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello from EduConnect Server.');
});

app.listen(port, () => {
  console.log(`EduConnect is running on port ${port}`);
});














