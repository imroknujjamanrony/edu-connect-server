require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const express = require("express");
const cors = require("cors");
// const cookieParser = require('cookie-parser');
const {
  MongoClient,
  ServerApiVersion,
  ObjectId,
  Timestamp,
} = require("mongodb");
const jwt = require("jsonwebtoken");
const morgan = require("morgan");

const generativeText = require("./utils/gemini");

const port = process.env.PORT || 5000;
const app = express();

// Middleware
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://educonnect-5a40e.firebaseapp.com",
    "https://educonnect-5a40e.web.app",
  ],
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(morgan("dev"));

//verifyToken
const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    // console.log("Missing Authorization Header");
    return res.status(401).send({ message: "Unauthorized access" });
  }

  const token = authHeader.split(" ")[1];
  // console.log('Extracted Token:', token);

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      // console.error("JWT Verification Error:", err);
      return res.status(401).send({ message: "Unauthorized access" });
    }

    req.decoded = decoded;
    next();
  });
};

// JWT Token Creation
app.post("/jwt", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).send({ message: "Email is required" });
    }

    const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: "365d",
    });

    res.send({ success: true, token }); // Send token in the response body
  } catch (error) {
    res.status(500).send({ message: "Internal server error" });
  }
});

// Logout
app.get("/logout", (req, res) => {
  try {
    res
      .clearCookie("token", {
        maxAge: 0,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
      })
      .send({ success: true });
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
    const db = client.db("EduConnect");
    const userCollection = db.collection("users");
    const classesCollection = db.collection("classes");
    const teacherReqCollection = db.collection("teacher-req");
    const paymentsCollection = db.collection("payments");
    const feedbackCollection = db.collection("feedback");

    //verifyAdmin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // Gemini API Endpoint
    app.post("/geminiBot", async (req, res) => {
      const { prompt } = req.body;
      console.log("👉 Received prompt:", prompt);
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      try {
        console.log("💡 Calling Gemini with prompt:", prompt);
        const response = await generativeText(prompt);
        res.json({ response });
      } catch (error) {
        res.status(500).json({ error: "Failed to generate content" });
      }
    });

    app.get("/test-env", (req, res) => {
      res.send({ key: process.env.GEMINI_API_KEY || "Not defined" });
    });

    // post feedback data
    app.post("/feedback", async (req, res) => {
      const feedback = req.body;
      const result = await feedbackCollection.insertOne(feedback);
      res.send(result);
    });
    // get feedback data
    app.get("/feedback", async (req, res) => {
      const result = await feedbackCollection.find().toArray();
      res.send(result);
    });

    //save a user
    app.post("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = req.body;
      //check if user is already in db or not
      isExist = await userCollection.findOne(query);
      if (isExist) {
        return res.send(isExist);
        // return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await userCollection.insertOne({
        ...user,
        role: "Student",
        timestamp: Date.now(),
      });
      res.send(result);
    });

    //

    // Get all the users
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    //for stat
    app.get("/users-stat", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // Get user data by email
    app.get("/user", verifyToken, async (req, res) => {
      try {
        const email = req.decoded.email; // Extract email from the verified token
        const query = { email: email };

        const user = await userCollection.findOne(query); // Find user by email

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send(user); // Send user data as response
      } catch (error) {
        console.error("Error retrieving user data:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    //admin verify route
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "unauthorized access" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (email) {
        admin = user.role === "admin";
      }
      res.send({ admin });
    });

    //

    // Search users by username or email
    app.get("/users/search", async (req, res) => {
      const query = req.query.query;
      const result = await userCollection
        .find({
          $or: [
            { name: { $regex: query, $options: "i" } },
            { email: { $regex: query, $options: "i" } },
          ],
        })
        .toArray();
      res.send(result);
    });

    // Make a user admin
    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { role: "admin" },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // Approve a class

    app.patch(
      "/allClasses/approve/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { status: "approved" },
        };
        const result = await classesCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // reject class/
    app.patch(
      "/allClasses/rejected/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { status: "rejected" },
        };
        const result = await classesCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    //

    // Delete a user
    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // send teacher-req on db
    app.post("/teacher-req", verifyToken, async (req, res) => {
      const data = req.body;
      const result = await teacherReqCollection.insertOne({
        ...data,
        role: "pending",
      });
      res.send(result);
    });

    //get all the teacher req
    app.get("/teacher-req", verifyToken, verifyAdmin, async (req, res) => {
      const result = await teacherReqCollection.find().toArray();
      res.send(result);
    });

    // get all teacher req for public route
    app.get("/all-teacher", async (req, res) => {
      const result = await teacherReqCollection.find().toArray();
      res.send(result);
    });

    // check the teacher's role for verify
    app.get("/teacher-req/teacher/:email", verifyToken, async (req, res) => {
      // get teacher
      const email = req.params.email;

      const query = { email: email };
      const user = await teacherReqCollection.findOne(query);
      let teacher = false;
      if (user) {
        teacher = user.role === "teacher";
      }
      res.send({ teacher });
    });

    app.patch(
      "/teacher-req/approve/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { role: "teacher" },
        };
        const result = await teacherReqCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // reject teacher req
    app.patch(
      "/teacher-req/rejected/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { role: "rejected" },
        };
        const result = await teacherReqCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    //send classes to db
    app.post("/class", async (req, res) => {
      const classs = req.body;
      const result = await classesCollection.insertOne({
        ...classs,
        status: "Pending",
      });
      res.send(result);
    });

    //after added filter for my class-

    app.get("/my-classes/:email", async (req, res) => {
      const userEmail = req.params.email;
      console.log("email:", userEmail);

      try {
        const result = await classesCollection
          .find({ "publisher.email": userEmail })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch classes", error });
      }
    });

    //get single my class info
    app.get("/my-classes/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classesCollection.findOne(query);
      res.send(result);
    });

    // Set up a new route to handle assignment creation
    app.patch("/my-classes/:id/assignments", verifyToken, async (req, res) => {
      const id = req.params.id;
      const assignmentData = req.body; // Get assignment data from request body

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          assignments: assignmentData, // Store the assignment data
        },
      };

      try {
        const result = await classesCollection.updateOne(filter, updateDoc);

        if (result.modifiedCount === 0) {
          throw new Error(
            "No documents matched the query. Updated 0 documents."
          );
        }

        res.status(200).json({
          status: "success",
          message: "Assignment updated successfully",
          data: assignmentData,
        });
      } catch (error) {
        console.error("Error updating assignment:", error);
        res.status(500).json({
          status: "error",
          message: "An error occurred while updating the assignment",
          error: error.message,
        });
      }
    });

    //delete class
    app.delete("/class/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const result = await classesCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount > 0) {
          res.status(200).json({ message: "Class deleted successfully" });
        } else {
          res.status(404).json({ message: "Class not found" });
        }
      } catch (error) {
        res.status(500).json({ message: "Failed to delete class", error });
      }
    });

    // Update a specific class by ID
    app.put("/class/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      const updatedClassData = req.body;

      try {
        const result = await classesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedClassData }
        );

        if (result.modifiedCount > 0) {
          res.status(200).send({ message: "Class updated successfully" });
        } else {
          res
            .status(404)
            .send({ message: "Class not found or no changes made" });
        }
      } catch (error) {
        res.status(500).send({ message: "Failed to update class", error });
      }
    });

    //

    //get all classes public route
    app.get("/allClasses", async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result);
    });

    //get single class details by id
    app.get("/class/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      try {
        const result = await classesCollection.findOne({
          _id: new ObjectId(id),
        });
        if (result) {
          res.send(result);
        } else {
          res.status(404).send({ message: "Class not found" });
        }
      } catch (error) {
        res.status(500).send({ message: "Internal server error" });
      }
    });

    //payment system

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
        const updRes = await classesCollection.updateOne(query, updatedDoc);
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

    //hey bangladesh

    //send money to database
    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const payResult = await paymentsCollection.insertOne(payment);
      // console.log("payment info", payment);
      res.send(payResult);
    });

    //after only my enroll class by my email
    app.get("/my-enrolled-class/:email", verifyToken, async (req, res) => {
      const userEmail = req.params.email;

      try {
        const result = await paymentsCollection
          .find({ email: userEmail })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch classes", error });
      }
    });

    // Ping MongoDB
    // await client.db('admin').command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Cleanup if needed
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from EduConnect Server.");
});

app.listen(port, () => {
  console.log(`EduConnect is running on port ${port}`);
});
