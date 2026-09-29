const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Patch 1: Replace mode tag in MatchDetailModal
const modeHtml = `
          </p>
          {match.mode && (
            <div className={cn(
              "inline-flex items-center mt-3 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
              match.mode === 'complete' ? "bg-gray-100 text-gray-600" :
              match.mode === 'missing_players' ? "bg-emerald-100 text-emerald-700" :
              "bg-violet-100 text-violet-700"
            )}>
              {match.mode === 'complete' ? 'Clásico' : match.mode === 'missing_players' ? 'Faltan jugadores' : 'Desafío'}
            </div>
          )}
        </div>
`;
code = code.replace(/<\/p>\s*<\/div>\s*<div className="p-6">/, modeHtml + '\n        <div className="p-6">');


// Patch 2: Schedule card bubble logic
code = code.replace(/let matchStatus = 'upcoming';\s*let dotColor = 'bg-emerald-500';\s*if \(now > matchEnd\) \{\s*matchStatus = 'past';\s*dotColor = 'bg-red-500';\s*\} else if \(now >= matchStart && now <= matchEnd\) \{\s*matchStatus = 'live';\s*dotColor = 'bg-yellow-400 animate-pulse';\s*\}/, 
`let matchStatus = 'upcoming';
                        let statusLabel = 'Próximo';
                        let statusColor = 'bg-emerald-100 text-emerald-700 border-emerald-200';

                        if (now > matchEnd) {
                          matchStatus = 'past';
                          statusLabel = 'Jugado';
                          statusColor = 'bg-red-100 text-red-700 border-red-200';
                        } else if (now >= matchStart && now <= matchEnd) {
                          matchStatus = 'live';
                          statusLabel = 'En juego';
                          statusColor = 'bg-yellow-100 text-yellow-700 border-yellow-200 animate-pulse';
                        }`);


// Patch 3: Schedule card header DOM
code = code.replace(/<div className="font-bold text-xs text-gray-900 truncate flex-1 leading-tight flex items-center gap-1.5">\s*<div className=\{cn\("w-2 h-2 rounded-full shrink-0", dotColor\)\><\/div>\s*<span className="truncate">\{match.host_name\}<\/span>\s*<\/div>/,
`<div className="font-bold text-xs text-gray-900 truncate flex-1 leading-tight">
                                {match.host_name}
                              </div>
                              <span className={cn("text-[8px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 border", statusColor)}>
                                {statusLabel}
                              </span>`);

// Patch 4: Remove pl-3.5 from phone
code = code.replace(/<div className="text-\[10px\] text-gray-500 mt-0\.5 leading-tight truncate pl-3\.5">/, `<div className="text-[10px] text-gray-500 mt-0.5 leading-tight truncate">`);

fs.writeFileSync('src/App.tsx', code);
console.log('Patched correctly');
