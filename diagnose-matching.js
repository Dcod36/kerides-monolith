const mongoose = require('mongoose');

const mongoUri = "mongodb://sahachari:backend@ac-bxx75qo-shard-00-00.argykzv.mongodb.net:27017,ac-bxx75qo-shard-00-01.argykzv.mongodb.net:27017,ac-bxx75qo-shard-00-02.argykzv.mongodb.net:27017/kerides_dev?ssl=true&replicaSet=atlas-128udk-shard-0&authSource=admin&retryWrites=true&w=majority";

async function run() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(mongoUri);
  console.log("Connected successfully!");

  // Query all driver profiles
  const profiles = await mongoose.connection.db.collection('driver_profiles').find({}).toArray();
  console.log(`\n--- Driver Profiles Found: ${profiles.length} ---`);
  for (const p of profiles) {
    console.log({
      id: p._id,
      accountId: p.accountId,
      isOnline: p.isOnline,
      isVerified: p.isVerified,
      latitude: p.latitude,
      longitude: p.longitude,
      lastLocationUpdate: p.lastLocationUpdate,
      assignedStandId: p.assignedStandId
    });
  }

  // Query all vehicles
  const vehicles = await mongoose.connection.db.collection('vehicles').find({}).toArray();
  console.log(`\n--- Vehicles Found: ${vehicles.length} ---`);
  for (const v of vehicles) {
    console.log({
      id: v._id,
      driverId: v.driverId,
      make: v.make,
      model: v.vehicleModel || v.model,
      registrationNumber: v.registrationNumber,
      type: v.type,
      verificationStatus: v.verificationStatus,
      isActive: v.isActive
    });
  }

  // Query all accounts
  const accounts = await mongoose.connection.db.collection('accounts').find({}).toArray();
  console.log(`\n--- Accounts (showing driver role) ---`);
  for (const a of accounts) {
    if (a.role === 'DRIVER') {
      console.log({
        id: a._id,
        fullName: a.fullName,
        email: a.email,
        role: a.role,
        isVerified: a.isVerified
      });
    }
  }

  await mongoose.disconnect();
  console.log("\nDisconnected from MongoDB.");
}

run().catch(err => {
  console.error(err);
  mongoose.disconnect();
});
