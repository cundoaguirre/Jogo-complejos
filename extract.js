const fs = require('fs');
const code = fs.readFileSync('src/App.tsx', 'utf8');

const start = code.indexOf('const ScheduleView =');
let end = code.indexOf('const DashboardView ='); // next component
if (end === -1) end = code.length;

console.log(code.substring(start, end));
