import re

with open("src/App.tsx", "r") as f:
    content = f.read()

# Fix Resumen general
content = content.replace(
    '<h2 className="text-[20px] sm:text-[24px] font-normal text-white pb-2.5 tracking-wide whitespace-nowrap">Resumen general</h2>',
    '<h2 className="text-[26px] sm:text-[28px] font-normal text-white pb-2.5 tracking-wide whitespace-nowrap">Resumen general</h2>'
)

# Fix Hoy/Sem/Mes
content = content.replace(
    'px-4 sm:px-5 py-2.5 text-[15px] rounded-t-[16px] transition-all min-w-[70px]',
    'px-4 sm:px-5 py-2 text-[12px] sm:text-[13px] rounded-t-[16px] transition-all min-w-[60px]'
)

# Fix Ingresos
content = content.replace(
    '<span className="text-[20px] font-normal text-gray-800">Ingresos</span>',
    '<span className="text-[16px] sm:text-[18px] font-normal text-gray-800">Ingresos</span>'
)

# Fix Ingresos value size (it's text-4xl currently)
content = content.replace(
    '<span className="text-4xl font-bold text-[#0BA70B] tracking-tight">',
    '<span className="text-[32px] sm:text-[36px] font-bold text-[#0BA70B] tracking-tight">'
)

# Fix Metrics labels to have IDENTICAL sizes
# Reservas
content = content.replace(
    '<span className="text-[#0BA70B] font-bold text-[14px] sm:text-[15px] mb-1.5">Reservas</span>',
    '<span className="text-[#0BA70B] font-bold text-[11px] sm:text-[13px] mb-1.5 whitespace-nowrap">Reservas</span>'
)
# Modo preferido
content = content.replace(
    '<span className="text-[#0BA70B] font-bold text-[11px] sm:text-[14px] lg:text-[15px] mb-1.5 leading-tight whitespace-nowrap">Modo preferido</span>',
    '<span className="text-[#0BA70B] font-bold text-[11px] sm:text-[13px] mb-1.5 whitespace-nowrap">Modo preferido</span>'
)
# Nuevos
content = content.replace(
    '<span className="text-[#0BA70B] font-bold text-[14px] sm:text-[15px] mb-1.5">Nuevos</span>',
    '<span className="text-[#0BA70B] font-bold text-[11px] sm:text-[13px] mb-1.5 whitespace-nowrap">Nuevos</span>'
)

# Fix Metrics values to have IDENTICAL sizes
# Reservas value
content = content.replace(
    '<span className="text-xl sm:text-2xl font-bold text-gray-900">{stats.todayMatches}</span>',
    '<span className="text-[15px] sm:text-[18px] font-bold text-gray-900 whitespace-nowrap">{stats.todayMatches}</span>'
)
# Modo preferido value
content = content.replace(
    '<span className="text-[14px] sm:text-[16px] font-bold text-gray-900">\n                {stats.preferredGameMode === \'challenge\' ? \'Desafío\' :\n                  stats.preferredGameMode === \'missing_players\' ? \'Falta uno\' : \'Completo\'}\n              </span>',
    '<span className="text-[15px] sm:text-[18px] font-bold text-gray-900 whitespace-nowrap">\n                {stats.preferredGameMode === \'challenge\' ? \'Desafío\' :\n                  stats.preferredGameMode === \'missing_players\' ? \'Falta uno\' : \'Completo\'}\n              </span>'
)
# Nuevos value
content = content.replace(
    '<span className="text-xl sm:text-2xl font-bold text-gray-900">{stats.newUsers}</span>',
    '<span className="text-[15px] sm:text-[18px] font-bold text-gray-900 whitespace-nowrap">{stats.newUsers}</span>'
)


with open("src/App.tsx", "w") as f:
    f.write(content)

