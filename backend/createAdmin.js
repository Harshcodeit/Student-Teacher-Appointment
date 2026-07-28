require("dotenv").config({ path: "./.env" });

const mongoose = require("mongoose");
const User = require("./models/User");

const ADMIN_ID = "653d33213eefdbe85eb9cd59";

async function createAdmin() {
  try {
    await mongoose.connect(process.env.DB_URL);
    console.log("Connected to MongoDB");

    let admin = await User.findById(ADMIN_ID);

    if (admin) {
      // Reset/update the existing admin
      admin.email = "admin@gmail.com";
      admin.name = "Admin";
      admin.department = "Administration";
      admin.subject = [];
      admin.age = 25;
      admin.roles = "admin";
      admin.admissionStatus = true;

      // This will be hashed by the User pre-save middleware
      admin.password = "admin";
      admin.passwordConfirm = "admin";

      await admin.save();

      console.log("Existing admin updated");
    } else {
      admin = await User.create({
        _id: ADMIN_ID,
        email: "admin@gmail.com",
        name: "Admin",
        department: "Administration",
        subject: [],
        age: 25,
        roles: "admin",
        password: "admin",
        passwordConfirm: "admin",
        admissionStatus: true,
      });

      console.log("Admin created");
    }

    console.log("Email: admin@gmail.com");
    console.log("Password: admin");
  } catch (error) {
    console.error("Admin setup failed:", error);
  } finally {
    await mongoose.disconnect();
  }
}

createAdmin();
