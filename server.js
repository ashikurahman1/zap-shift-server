require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const app = express();

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const PORT = process.env.PORT || 3000;

// Generate Tracking id
const crypto = require('crypto');

const admin = require('firebase-admin');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Generate the tracking id using node
function generateTrackingId() {
  const prefix = 'ZS'; // brand prefix
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = crypto.randomBytes(3).toString('hex').toLocaleUpperCase();

  return `${prefix}-${date}-${random}`;
}

// middleware
app.use(express.json());
app.use(cors());

// verify firebase  Token
const verifyFirebaseToken = async (req, res, next) => {
  console.log(req.headers.authorization);
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).send({ message: 'Unauthorized Access' });
  }

  try {
    const authorization = token.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(authorization);
    console.log('decoded in the token', decoded);
    req.decoded_email = decoded.email;

    next();
  } catch (error) {
    return res.status(401).send({ message: 'Unauthorized access' });
  }
};

const uri = process.env.MONGO_URI;
const YOUR_DOMAIN = process.env.SITE_DOMAIN;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get('/', (req, res) => {
  res.send('zap is shifting shifting');
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const db = client.db('zap_shift_db');
    const usersCollection = db.collection('users');
    const parcelsCollection = db.collection('parcels');
    const paymentCollection = db.collection('payments');
    const ridersCollection = db.collection('riders');

    //Verify Admin Token
    // এডমিন এক্টিভিটি এলাউ করার পূর্বে
    // অবশ্যই TokenVerify করার পরে ব্যবহার করবো
    const verifyAdmin = async (req, res, next) => {
      // req
      const email = req.decoded_email; // টোকেন যখন ভেরিফাই করবে তখন সেটার req এর মধ্যে আমরা ইমেইলটা পেয়ে যাবো।

      const query = { email };
      const user = await usersCollection.findOne(query);

      if (!user || user.role !== 'admin') {
        return res.status(403).send({ message: 'Forbidden Access' });
      }

      next();
    };

    // Users related API
    app.get('/users', async (req, res) => {
      const searchText = req.query.searchText;
      const query = {};
      if (searchText) {
        // query.displayName = { $regex: searchText, $options: 'i' };
        // { <field>: { $regex: /pattern/, $options: '<options>' } }

        query.$or = [
          { displayName: { $regex: searchText, $options: 'i' } },
          { email: { $regex: searchText, $options: 'i' } },
        ];

        // এখানে প্রথম মেথড শুধু নামের উপর কুয়েরি করবে, 2য় মেথডে যে কোন ্ প্রোপার্টি নাম দিলে সেগুলোর উপর কাজ করবে
      }
      const cursor = usersCollection
        .find(query)
        .sort({ createdAt: -1 })
        .limit(5);
      const result = await cursor.toArray();
      res.send(result);
    });
    app.get('/users/:id', async (req, res) => {});
    app.get('/users/:email/role', async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role || 'user' });
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      user.role = 'user';
      user.createdAt = new Date();
      const email = user.email;

      const userExist = await usersCollection.findOne({ email });
      if (userExist) {
        return res.send({ message: 'User already exist' });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.patch(
      '/users/:id/role',
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;
        const roleInfo = req.body;
        const query = {
          _id: new ObjectId(id),
        };
        const updatedDoc = {
          $set: {
            role: roleInfo.role,
          },
        };
        const result = await usersCollection.updateOne(query, updatedDoc);
        res.send(result);
      }
    );
    // Parcel API
    app.get('/parcels', async (req, res) => {
      try {
        const query = {};
        const { email, deliveryStatus } = req.query;
        // Parcels?email=''&
        if (email) {
          query.email = email;
        }
        if (deliveryStatus) {
          query.deliveryStatus = deliveryStatus;
        }
        const options = { sort: { createdAt: -1 } };
        const cursor = parcelsCollection.find(query, options);
        const result = await cursor.toArray();
        res.status(200).send(result);
      } catch (error) {
        console.log(error.message);
        res.send('Server error ');
      }
    });

    app.get('/parcels/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const query = { _id: new ObjectId(id) };
        const result = await parcelsCollection.findOne(query);
        res.status(200).send(result);
      } catch (error) {
        console.log(error.message);
        res.send('Server error ');
      }
    });

    app.post('/parcels', async (req, res) => {
      try {
        const parcel = req.body;
        parcel.createdAt = new Date();
        const result = await parcelsCollection.insertOne(parcel);
        res.status(200).send(result);
      } catch (error) {
        console.log(error.message);
        res.send('Server error ');
      }
    });
    app.delete('/parcels/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const query = { _id: new ObjectId(id) };
        const result = await parcelsCollection.deleteOne(query);
        res.status(200).send(result);
      } catch (error) {
        console.log(error.message);
        res.send('Server error ');
      }
    });

    app.patch('/parcels/:id', async (req, res) => {
      const { riderId, riderEmail, riderName } = req.body;
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          deliveryStatus: 'rider-assign',
          riderId: riderId,
          riderName: riderName,
          riderEmail: riderEmail,
        },
      };
      const result = await parcelsCollection.updateOne(query, updatedDoc);

      //Update Rider Data

      const riderQuery = { _id: new ObjectId(riderId) };
      const riderUpdatedDoc = {
        $set: {
          workStatus: 'assign-pickup',
        },
      };
      const riderResult = await ridersCollection.updateOne(
        riderQuery,
        riderUpdatedDoc
      );
      res.send(riderResult);
    });

    // Payment API
    app.post('/create-checkout-session', async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.cost) * 100;

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: 'USD',
              unit_amount: amount,
              product_data: {
                name: paymentInfo.parcelName,
              },
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        metadata: {
          parcelId: paymentInfo.parcelId,
          parcelName: paymentInfo.parcelName,
        },
        customer_email: paymentInfo.senderEmail,
        // success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success`,
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });
      console.log(session);
      res.send({ url: session.url });
    });

    // patch
    app.patch('/payment-success', async (req, res) => {
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      // console.log('retrieve', session);

      const transactionId = session.payment_intent;
      const query = { transactionId: transactionId };
      const paymentExist = await paymentCollection.findOne(query);
      if (paymentExist) {
        return res.send({
          message: 'already exist',
          transactionId,
          trackingId: paymentExist.trackingId,
        });
      }

      const trackingId = generateTrackingId();
      if (session.payment_status === 'paid') {
        const id = session.metadata.parcelId;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            paymentStatus: 'paid',
            deliveryStatus: 'pending-pickup',
            trackingId: generateTrackingId(),
          },
        };
        const result = await parcelsCollection.updateOne(query, update);

        const payment = {
          amount: session.amount_total / 100,
          currency: session.currency,
          // trackingId: session.trackingId,
          senderEmail: session.customer_email,
          parcelId: session.metadata.parcelId,
          parcelName: session.metadata.parcelName,
          transactionId: session.payment_intent,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
          trackingId: trackingId,
        };

        if (session.payment_status === 'paid') {
          const resultPayment = await paymentCollection.insertOne(payment);
          res.send({
            success: true,
            modifyParcel: result,
            paymentInfo: resultPayment,
            trackingId: trackingId,
            transactionId: session.payment_intent,
          });
        }
      }

      res.send({ success: false });
    });

    app.get('/payments', verifyFirebaseToken, async (req, res) => {
      try {
        const { email } = req.query;
        const query = {};

        if (email) {
          query.senderEmail = email;

          // Strong verification or check email address

          if (email !== req.decoded_email) {
            return res.status(403).send({ message: 'Forbidden access' });
          }
        }
        const cursor = paymentCollection.find(query).sort({ paidAt: -1 });
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        console.log(error.message);
        res.send('Server error ');
      }
    });

    // Riders related Api
    app.get('/riders', async (req, res) => {
      const { status, district, workStatus } = req.query;
      const query = {};
      if (status) {
        query.status = status;
      }

      if (district) {
        query.riderDistrict = district;
      }

      if (workStatus) {
        query.workStatus = workStatus;
      }

      const cursor = ridersCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post('/riders', async (req, res) => {
      const rider = req.body;
      rider.status = 'pending';
      rider.createdAt = new Date();

      const result = await ridersCollection.insertOne(rider);

      res.send(result);
    });

    app.patch(
      '/riders/:id',
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const status = req.body.status;
        const { id } = req.params;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            status: status,
            workStatus: 'available',
          },
        };
        const result = await ridersCollection.updateOne(query, updatedDoc);

        if (status === 'approved') {
          const email = req.body.email;
          const userQuery = { email };
          const updateUser = {
            $set: {
              role: 'rider',
            },
          };
          const userResult = await usersCollection.updateOne(
            userQuery,
            updateUser
          );
        }

        res.send(result);
      }
    );

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`);
});
