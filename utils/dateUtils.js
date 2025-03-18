const { isWorkingDay, calculateWorkingDays, getHolidaysBetween, getNextWorkingDay } = require('./holidayUtils');

function getRelativeDate(dateText, currentDate = new Date()) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const text = dateText.toLowerCase();

    // Handle "this" and "next" week days
    const thisNextMatch = text.match(/(this|next)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
    if (thisNextMatch) {
        const isNext = thisNextMatch[1] === 'next';
        const targetDay = dayNames.indexOf(thisNextMatch[2]);
        const result = new Date(currentDate);
        const currentDay = result.getDay();
        let daysToAdd = targetDay - currentDay;
        
        if (daysToAdd <= 0 && isNext) {
            daysToAdd += 7;
        } else if (daysToAdd < 0) {
            daysToAdd += 7;
        } else if (daysToAdd === 0 && isNext) {
            daysToAdd = 7;
        }
        
        result.setDate(result.getDate() + daysToAdd);
        
        // If it's a weekend or holiday, get next working day
        if (!isWorkingDay(result)) {
            return getNextWorkingDay(result);
        }
        return result;
    }

    // Handle "tomorrow" and "day after tomorrow"
    if (text.includes('tomorrow')) {
        const result = new Date(currentDate);
        result.setDate(result.getDate() + 1);
        // If tomorrow is not a working day, get next working day
        if (!isWorkingDay(result)) {
            return getNextWorkingDay(result);
        }
        return result;
    }
    if (text.includes('day after tomorrow')) {
        const result = new Date(currentDate);
        result.setDate(result.getDate() + 2);
        // If day after tomorrow is not a working day, get next working day
        if (!isWorkingDay(result)) {
            return getNextWorkingDay(result);
        }
        return result;
    }

    // Handle "in X days"
    const inDaysMatch = text.match(/in\s+(\d+)\s+(?:business|working)?\s*days?/);
    if (inDaysMatch) {
        const daysToAdd = parseInt(inDaysMatch[1]);
        let result = new Date(currentDate);
        
        // If specifically asking for business/working days
        if (text.includes('business') || text.includes('working')) {
            let workingDaysAdded = 0;
            while (workingDaysAdded < daysToAdd) {
                result.setDate(result.getDate() + 1);
                if (isWorkingDay(result)) {
                    workingDaysAdded++;
                }
            }
        } else {
            result.setDate(result.getDate() + daysToAdd);
            // If lands on weekend/holiday, get next working day
            if (!isWorkingDay(result)) {
                result = getNextWorkingDay(result);
            }
        }
        return result;
    }

    // Handle "next week"
    if (text.includes('next week')) {
        const result = new Date(currentDate);
        result.setDate(result.getDate() + 7);
        // If lands on weekend/holiday, get next working day
        if (!isWorkingDay(result)) {
            return getNextWorkingDay(result);
        }
        return result;
    }

    return null;
}

function formatDate(date) {
    return date.toISOString().split('T')[0];
}

function parseRelativeDateRange(text, currentDate = new Date()) {
    const parts = text.toLowerCase().split(/\s*(?:to|through|until|and)\s*/);
    if (parts.length === 2) {
        const startDate = getRelativeDate(parts[0], currentDate);
        const endDate = getRelativeDate(parts[1], currentDate);
        
        if (startDate && endDate) {
            // Get holidays between dates
            const holidays = getHolidaysBetween(startDate, endDate);
            const holidayInfo = holidays.length > 0 
                ? `\nNote: This period includes the following holidays:\n${holidays.map(h => `- ${h.name} (${h.date})`).join('\n')}`
                : '';

            return {
                startDate: formatDate(startDate),
                endDate: formatDate(endDate),
                numberOfDays: calculateWorkingDays(startDate, endDate),
                excludedDays: {
                    weekends: true,
                    holidays: true
                },
                holidayInfo: holidayInfo
            };
        }
    } else {
        // Handle single day
        const date = getRelativeDate(text, currentDate);
        if (date) {
            const formattedDate = formatDate(date);
            return {
                startDate: formattedDate,
                endDate: formattedDate,
                numberOfDays: 1,
                excludedDays: {
                    weekends: true,
                    holidays: true
                }
            };
        }
    }
    return null;
}

module.exports = {
    getRelativeDate,
    formatDate,
    parseRelativeDateRange
};
