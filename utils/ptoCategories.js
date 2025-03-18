const PTO_CATEGORIES = [
    'Bereavement',
    'FMLA',
    'Jury Duty',
    'Maternity/Paternity',
    'Medical Leave',
    'Military',
    'Out of Office / Travel',
    'Paid Time Off',
    'Sick Day',
    'Unpaid Time Off'
];

function isValidPTOCategory(category) {
    return PTO_CATEGORIES.includes(category);
}

function extractPTOCategory(text) {
    const lowerText = text.toLowerCase();
    return PTO_CATEGORIES.find(category => 
        lowerText.includes(category.toLowerCase())
    );
}

module.exports = {
    PTO_CATEGORIES,
    isValidPTOCategory,
    extractPTOCategory
};
