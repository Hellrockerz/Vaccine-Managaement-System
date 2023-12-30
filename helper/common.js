const nodemailer = require('nodemailer')

function generateOTP() {
    let random = Math.random()
    let OTP = Math.floor(random * 900000) + 100000
    return OTP
}
async function sendMail(email, subject, text) {
    try {
        let transporter = nodemailer.createTransport({
            service: "gmail",
            port: 587,
            secure: true,
            auth: {
                user: 'mukulgautam18112000@gmail.com',
                pass: 'fgla kfik wycj dxub',
            },
        })
        let options = {
            from: 'noreply-mobiloitte@gmail.com', // Sender's email address
            to: email, // Replace with the recipient's email
            subject: subject,
            text: text,
        }
        return await transporter.sendMail(options)
    } catch (error) {
        console.log(error.message)
    }
}
function numToDay(dayNumber) {

    if (dayNumber >= 1 && dayNumber <= 7) {
        const today = new Date();
        today.setDate(today.getDate() + (dayNumber - today.getDay() + 7) % 7);
        console.log(today.toDateString().slice(0,3))
        return today.toDateString().slice(0,3);
    } else {
        return "Invalid day number";
    }
}
function formatTime(time) {
    return `${time.getHours()}:${(time.getMinutes() < 10 ? '0' : '') + time.getMinutes()}`;
}

function createSlots(startTime, endTime, breakTimes, slotDuration) {
    const slots = [];
    const referenceDate = new Date("2000-01-01");
    const currentTime = new Date(`${referenceDate.toDateString()} ${startTime}`);
    const endTimeObj = new Date(`${referenceDate.toDateString()} ${endTime}`);

    const breakIntervals = breakTimes.map(([breakStartTime, breakEndTime]) => ({
        start: new Date(`${referenceDate.toDateString()} ${breakStartTime}`),
        end: new Date(`${referenceDate.toDateString()} ${breakEndTime}`)
    }));
    
    while (currentTime < endTimeObj) {
        const slotEndTime = new Date(currentTime.getTime() + slotDuration * 60000);

        const isBreakTime = breakIntervals.some(interval => currentTime >= interval.start && currentTime < interval.end);

        slots.push({
            slotTiming: `${formatTime(currentTime)} to ${formatTime(slotEndTime)}`,
            available: !isBreakTime,
        });

        currentTime.setTime(currentTime.getTime() + slotDuration * 60000);
    }

    // console.log(slots);
    return slots
}

module.exports = { generateOTP, sendMail, numToDay, createSlots }