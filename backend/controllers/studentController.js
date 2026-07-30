const Appointment = require("../models/Appointment");
const User = require("../models/User");
const AppError = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");
const { connect } = require("../utils/sendEmail");
const { signToken } = require("./authController");
const transporter = connect();

const getTeacherWithAppointments = async (id) => {
  return await Appointment.find({
    "students.studentId": { $not: { $eq: [id] } },
  });
};

const getRegisteredAppointments = async (id) => {
  return await Appointment.find({
    "students.studentId": id,
  });
};

exports.register = catchAsync(async (req, res, next) => {
  const user = {
    email: req.body.email,
    name: req.body.name,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
    department: req.body.department,
    age: req.body.age,
  };

  // Check if a user with the same email already exists
  const existing = await User.findOne({ email: user.email });
  if (existing) {
    return res.status(400).json({
      status: "FAIL",
      message: "Email already in use",
    });
  }

  const newUser = await User.create(user);
  newUser.password = undefined;

  const token = await signToken(
    newUser._id,
    newUser.roles,
    newUser.name,
    newUser.email,
    newUser.admissionStatus,
  );

  res.status(200).json({
    status: "SUCCESS",
    message: "Student created",
    data: {
      newUser,
    },
    token,
  });
});

/*
After the student is added to the appointment:
find the teacher using the appointment’s sendBy email.
obtain the teacher’s MongoDB ID.
retrieve Socket.IO from Express
emit only to teacher's private room
*/

exports.bookAppointment = catchAsync(async (req, res, next) => {
  const appointment = {
    _id: req.params.id,
  };

  //get appointment student is trying to book
  const selectedAppointMent = await Appointment.findById(req.params.id);

  //-------------------Debugging
  // console.log({
  //   appointmentId: req.params.id,
  //   studentId: req.user.id,
  //   teacherEmail: selectedAppointMent.sendBy,
  // });

  if (!selectedAppointMent) {
    return next(new AppError("Appointment was not found", 404));
  }

  // check if student already booked slot of this teacher before
  const existingBooking = await Appointment.findOne({
    sendBy: selectedAppointMent.sendBy,
    "students.studentId": req.user.id,
  });

  if (existingBooking) {
    return next(
      new AppError("You alredy have an appoinment with this teacher", 400),
    );
  }

  /// mail
  const newAppointment = await Appointment.findOneAndUpdate(
    appointment,
    { $push: { students: { studentId: req.user.id, approved: false } } },
    { new: true },
  );

  if (!newAppointment) {
    return next(new AppError("Appointment was not found", 404));
  }

  const teacher = await User.findOne({
    email: newAppointment.sendBy,
    roles: "teacher",
  });

  if (teacher) {
    const io = req.app.get("io");

    io.to(`user:${teacher._id}`).emit("appointment-requested", {
      appointmentId: newAppointment._id,
      studentId: req.user.id,
      studentName: req.user.name,
      teacherId: teacher._id,
      scheduleAt: newAppointment.scheduleAt,
      message: `${req.user.name} requested an appointment`,
    });

    console.log(`Appointment request sent to teacher room user:${teacher._id}`);
  }

  // console.log(newAppointment)
  const scheduledDate = new Date(newAppointment.scheduleAt);
  const formattedDate = scheduledDate.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
  const formattedTime = scheduledDate.toLocaleString("en-US", {
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  });

  let info = transporter.sendMail({
    from: '"tutor-time@brevo.com',
    to: newAppointment.sendBy,
    subject: "Appointment Request",
    html: `
            <h2>Dear Teacher,</h2>
            <p>We hope this message finds you well.</p>
            <p>You have received an appointment request from a student scheduled for ${formattedDate}, and the timing is ${formattedTime}.</p>
            <p>Please log in to our platform to review and respond to the request.</p>
            <p>Thank you for your time and commitment to your students.</p>
            <p>Best regards,</p>
            <p>Tutor-Time</p>
            <p><a href="Website URL">Visit our website</a></p>
        `,
  });
  res.status(200).json({
    status: "SUCCESS",
    data: {
      newAppointment,
    },
  });
});

exports.getTeacherWithAppointments = catchAsync(async (req, res, next) => {
  const appointments = await getTeacherWithAppointments(req.user.id);
  res.status(200).json({
    status: "Success",
    appointments,
  });
});

// exports.registeredAppointments = catchAsync(async (req, res, next) => {
//   const appointments = await getRegisteredAppointments(req.user.id);
//   res.status(200).json({
//     status: "Success",
//     appointments,
//   });
// });

exports.registeredAppointments = catchAsync(async (req, res, next) => {
  const appointments = await getRegisteredAppointments(req.user.id);

  const formattedAppointments = appointments.map((appointment) => {
    const studentEntry = appointment.students.find(
      (student) => student.studentId.toString() === req.user.id.toString(),
    );

    return {
      ...appointment.toObject(),
      approvalStatus: studentEntry?.approved === true ? "approved" : "pending",
    };
  });

  console.log(
    formattedAppointments.map((appointment) => ({
      id: appointment._id,
      status: appointment.approvalStatus,
    })),
  );

  res.status(200).json({
    status: "Success",
    appointments: formattedAppointments,
  });
});
