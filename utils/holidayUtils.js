// US Federal Holidays for 2025
const HOLIDAYS_2025 = [
    { date: '2025-01-01', name: "New Year's Day" },
    { date: '2025-01-20', name: "Martin Luther King Jr. Day" },
    { date: '2025-02-17', name: "Presidents' Day" },
    { date: '2025-05-26', name: "Memorial Day" },
    { date: '2025-06-19', name: "Juneteenth" },
    { date: '2025-07-04', name: "Independence Day" },
    { date: '2025-09-01', name: "Labor Day" },
    { date: '2025-10-13', name: "Columbus Day" },
    { date: '2025-11-11', name: "Veterans Day" },
    { date: '2025-11-27', name: "Thanksgiving Day" },
    { date: '2025-12-25', name: "Christmas Day" }
];

function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6; // 0 is Sunday, 6 is Saturday
}

function isHoliday(date) {
    const dateStr = date.toISOString().split('T')[0];
    return HOLIDAYS_2025.some(holiday => holiday.date === dateStr);
}

function isWorkingDay(date) {
    return !isWeekend(date) && !isHoliday(date);
}

function getNextWorkingDay(date) {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    
    while (!isWorkingDay(nextDay)) {
        nextDay.setDate(nextDay.getDate() + 1);
    }
    
    return nextDay;
}

function calculateWorkingDays(startDate, endDate) {
    let workDays = 0;
    let currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
        if (isWorkingDay(currentDate)) {
            workDays++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return workDays;
}

function getHolidaysBetween(startDate, endDate) {
    return HOLIDAYS_2025.filter(holiday => {
        const holidayDate = new Date(holiday.date);
        return holidayDate >= startDate && holidayDate <= endDate;
    });
}

module.exports = {
    isWeekend,
    isHoliday,
    isWorkingDay,
    getNextWorkingDay,
    calculateWorkingDays,
    getHolidaysBetween,
    HOLIDAYS_2025
};
