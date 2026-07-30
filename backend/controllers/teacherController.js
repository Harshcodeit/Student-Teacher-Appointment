const User = require("../models/User");
const Appointment = require("../models/Appointment");
const AppError = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");
const { connect } = require("../utils/sendEmail");
const transporter = connect();

// Helper function to check if two appointment times clash
const checkTimeClash = (time1, time2) => {
  const timeDiff = Math.abs(new Date(time1) - new Date(time2));
  return timeDiff <= 7200000; // 120 minutes in milliseconds
};

// Helper function to retrieve appointments for a user within a specific date range
const getUserAppointments = async (email, startDate, endDate) => {
  return await Appointment.find({
    sendBy: email,

    scheduleAt: { $gte: startDate, $lt: endDate },
  });
};

exports.getAllPendingStudents = catchAsync(async (req, res, next) => {
  const appointments = await Appointment.find({
    sendBy: req.user.email,
    "students.approved": false,
  }).populate({
    path: "students.studentId",
    select: "_id name department email",
  });

  const students = appointments
    .map((appointment) => {
      const pendingStudents = appointment.students.filter(
        (student) => student.approved === false,
      );

      return {
        _id: appointment._id,
        name: appointment.name,
        scheduleAt: appointment.scheduleAt,
        students: pendingStudents,
      };
    })
    .filter((appointment) => appointment.students.length > 0);

  res.status(200).json({
    status: "Success",
    students,
  });
});

exports.getAllAppointments = catchAsync(async (req, res) => {
  const appointments = await Appointment.find({
    sendBy: req.user.email,
  }).populate("students.studentId", "name email");

  //   console.log("Appointments:", appointments);
  res.status(200).json({ appointments });
});

exports.createAppointment = catchAsync(async (req, res, next) => {
  const sendBy = req.user.email;
  const name = req.user.name;
  const scheduleAt = req.body.scheduleAt;

  const newAppointment = await Appointment.create({ sendBy, name, scheduleAt });
  await User.findByIdAndUpdate(
    { _id: req.user.id },
    { $push: { appointments: newAppointment._id } },
  );

  const io = req.app.get("io");

  io.to("role:student").emit("appointment-created", {
    appointmentId: newAppointment._id,
    teacherName: newAppointment.name,
    teacherEmail: newAppointment.sendBy,
    scheduleAt: newAppointment.scheduleAt,
    message: `${newAppointment.name} added a new appointment slot`,
  });

  res.status(200).json({
    newAppointment,
  });
});

exports.approveAppointment = catchAsync(async (req, res, next) => {
  const appointment = await Appointment.findOneAndUpdate(
    {
      _id: req.params.id,
      "students.studentId": req.params.studentId,
    },
    {
      $set: {
        "students.$.approved": true,
      },
    },
    { new: true },
  );

  if (!appointment) {
    return next(new AppError("Appointment request not found", 404));
  }

  const student = await User.findById(req.params.studentId).select(
    "_id email name",
  );

  if (!student) {
    return next(new AppError("Student not found", 404));
  }

  // Send real-time update to this student only
  const io = req.app.get("io");

  io.to(`user:${student._id}`).emit("appointment-status-updated", {
    appointmentId: appointment._id,
    status: "approved",
    teacherName: req.user.name,
    scheduleAt: appointment.scheduleAt,
    message: `${req.user.name} approved your appointment`,
  });

  console.log(`Approval sent to student room user:${student._id}`);

  transporter.sendMail({
    from: '"tutor-time@brevo.com"',
    to: student.email,
    subject: "Appointment Accepted",
    html: `
      <h2>Dear Student,</h2>
      <p>Your appointment request has been accepted.</p>
      <p>Please join the session on time.</p>
      <p>Best regards,</p>
      <p>Tutor-Time</p>
    `,
  });

  res.status(200).json({
    message: "Approved",
    appointment,
  });
});

exports.dissapproveAppointment = catchAsync(async (req, res, next) => {
  const appointment = await Appointment.findOneAndUpdate(
    {
      _id: req.params.id,
      "students.studentId": req.params.studentId,
    },
    {
      $pull: {
        students: {
          studentId: req.params.studentId,
        },
      },
    },
    { new: true },
  );

  if (!appointment) {
    return next(new AppError("Appointment request not found", 404));
  }

  const student = await User.findById(req.params.studentId).select(
    "_id email name",
  );

  if (!student) {
    return next(new AppError("Student not found", 404));
  }

  // Send real-time update to this student only
  const io = req.app.get("io");

  io.to(`user:${student._id}`).emit("appointment-status-updated", {
    appointmentId: appointment._id,
    status: "rejected",
    teacherName: req.user.name,
    message: `${req.user.name} rejected your appointment`,
  });

  console.log(`Rejection sent to student room user:${student._id}`);

  transporter.sendMail({
    from: '"tutor-time@brevo.com"',
    to: student.email,
    subject: "Appointment Rejected",
    html: `
        <h2>Dear Student,</h2>
        <p>Your appointment request has been rejected.</p>
        <p>You may book an appointment with another teacher.</p>
        <p>Best regards,</p>
        <p>Tutor-Time</p>
      `,
  });

  res.status(200).json({
    message: "Student rejected",
  });
});

exports.deleteAppointment = catchAsync(async (req, res, next) => {
  const deletedAppointment = await Appointment.findByIdAndDelete(req.params.id);

  if (!deletedAppointment) {
    return next(new AppError("Appointment not found", 404));
  }

  await User.findByIdAndUpdate(req.user.id, {
    $pull: { appointments: req.params.id },
  });

  const io = req.app.get("io");

  io.to("role:student").emit("appointment-deleted", {
    appointmentId: deletedAppointment._id,
    teacherName: deletedAppointment.name,
    scheduleAt: deletedAppointment.scheduleAt,
    message: `${deletedAppointment.name} cancelled an appointment slot`,
  });

  res.status(200).json({ status: "SUCCESS", message: "Appointment deleted" });
});

exports.getAllStudents = catchAsync(async (req, res) => {
  const filter = { roles: "student", ...req.query };
  const students = await User.find(filter).collation({
    locale: "en",
    strength: 2,
  });
  res.status(200).json({ students });
});
