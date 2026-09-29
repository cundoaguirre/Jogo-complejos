import re

with open("src/App.tsx", "r") as f:
    content = f.read()

start_marker = '      {/* Header with Time Selector and Revenue */}'
end_marker = '      <div className="grid grid-cols-1 gap-6">'

replacement = """      {/* Resumen General Section */}
      <div className="space-y-0 relative">
        {/* Title and Tabs Header */}
        <div className="flex justify-between items-end px-2 pt-2 z-10 relative">
          <h2 className="text-2xl font-bold text-gray-900 pb-2">Resumen general</h2>
          <div className="flex bg-transparent">
            <button 
              onClick={() => setPeriod('today')}
              className={cn(
                "px-4 sm:px-5 py-2 text-sm font-bold rounded-t-xl transition-all", 
                period === 'today' ? "bg-white text-emerald-600 shadow-[0_-2px_10px_rgba(0,0,0,0.02)]" : "text-gray-900 hover:text-emerald-600"
              )}
            >
              Hoy
            </button>
            <button 
              onClick={() => setPeriod('7d')}
              className={cn(
                "px-4 sm:px-5 py-2 text-sm font-bold rounded-t-xl transition-all", 
                period === '7d' ? "bg-white text-emerald-600 shadow-[0_-2px_10px_rgba(0,0,0,0.02)]" : "text-gray-900 hover:text-emerald-600"
              )}
            >
              Sem
            </button>
            <button 
              onClick={() => setPeriod('30d')}
              className={cn(
                "px-4 sm:px-5 py-2 text-sm font-bold rounded-t-xl transition-all", 
                period === '30d' ? "bg-white text-emerald-600 shadow-[0_-2px_10px_rgba(0,0,0,0.02)]" : "text-gray-900 hover:text-emerald-600"
              )}
            >
              Mes
            </button>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-[24px] rounded-tr-none p-5 sm:p-6 shadow-sm relative z-0">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-2">
              <span className="text-[22px] font-bold text-gray-900">Ingresos</span>
              <Eye className="text-emerald-600" size={24} />
            </div>
            <span className="text-4xl font-extrabold text-emerald-600">$ {stats.revenue.toLocaleString()}</span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 rounded-2xl p-4 flex flex-col items-center justify-center min-h-[110px]">
              <span className="text-emerald-600 font-bold text-[15px] mb-3">Reservas</span>
              <span className="text-2xl font-extrabold text-gray-900">{stats.todayMatches}</span>
            </div>
            
            <div className="bg-emerald-50 rounded-2xl p-3 sm:p-4 flex flex-col items-center justify-center min-h-[110px] text-center">
              <span className="text-emerald-600 font-bold text-[13px] sm:text-[15px] mb-3 leading-tight">Modo preferido</span>
              <span className="text-[15px] sm:text-[17px] font-extrabold text-gray-900">
                {stats.preferredGameMode === 'challenge' ? 'Desafío' :
                  stats.preferredGameMode === 'missing_players' ? 'Falta uno' : 'Completo'}
              </span>
            </div>
            
            <div className="bg-emerald-50 rounded-2xl p-4 flex flex-col items-center justify-center min-h-[110px]">
              <span className="text-emerald-600 font-bold text-[15px] mb-3">Nuevos</span>
              <span className="text-2xl font-extrabold text-gray-900">{stats.newUsers}</span>
            </div>
          </div>
        </div>
      </div>
"""

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    new_content = content[:start_idx] + replacement + "\n" + content[end_idx:]
    with open("src/App.tsx", "w") as f:
        f.write(new_content)
    print("Success")
else:
    print("Markers not found")

