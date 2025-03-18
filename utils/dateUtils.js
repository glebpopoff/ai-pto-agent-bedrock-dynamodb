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
        return result;
    }

    // Handle "tomorrow" and "day after tomorrow"
    if (text.includes('tomorrow')) {
        const result = new Date(currentDate);
        result.setDate(result.getDate() + 1);
        return result;
    }
    if (text.includes('day after tomorrow')) {
        const result = new Date(currentDate);
        result.setDate(result.getDate() + 2);
        return result;
    }

    // Handle "in X days"
    const inDaysMatch = text.match(/in\s+(\d+)\s+days?/);
    if (inDaysMatch) {
        const daysToAdd = parseInt(inDaysMatch[1]);
        const result = new Date(currentDate);
        result.setDate(result.getDate() + daysToAdd);
        return result;
    }

    // Handle "next week"
    if (text.includes('next week')) {
        const result = new Date(currentDate);
        result.setDate(result.getDate() + 7);
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
            return {
                startDate: formatDate(startDate),
                endDate: formatDate(endDate),
                numberOfDays: Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1
            };
        }
    } else {
        // Handle single day
        const date = getRelativeDate(text, currentDate);
        if (date) {
            return {
                startDate: formatDate(date),
                endDate: formatDate(date),
                numberOfDays: 1
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
