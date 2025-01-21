
require('dotenv').config();
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
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));

// JWT Verification Middleware
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: 'Unauthorized access' });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err);
      return res.status(401).send({ message: 'Unauthorized access' });
    }
    req.user = decoded;
    next();
  });
};

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
    const db=client.db('EduConnect')
    const userCollection=db.collection('users')
    const classesCollection=db.collection('classes')
    
    
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
app.get('/users', async (req, res) => {
  const result = await userCollection.find().toArray();
  res.send(result);
});

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
app.patch('/users/admin/:id', async (req, res) => {
  const id = req.params.id;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = {
    $set: { role: 'admin' }
  };
  const result = await userCollection.updateOne(filter, updateDoc);
  res.send(result);
});

// Delete a user
app.delete('/users/:id', async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const result = await userCollection.deleteOne(query);
  res.send(result);
});



    //send classes to db
    app.post('/class',async(req,res)=>{
      const classs=req.body
      const result=await classesCollection.insertOne({...classs,status:'Pending'})
      res.send(result)
    })

    //get My all classes
    app.get('/myClasses',async(req,res)=>{
     
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
app.put('/class/:id', async (req, res) => {
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
        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        }).send({ success: true });
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
