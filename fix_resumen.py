import re

with open("src/App.tsx", "r") as f:
    content = f.read()

# Replace the whole Resumen General Section
old_section = content[content.find('{/* Resumen General Section */}'):content.find('      <div className="grid grid-cols-1 gap-6 relative z-10">')]

new_section = """{/* Resumen General Section */}
      <div className="space-y-0 relative mt-4 z-10">
        {/* Title and Tabs Header */}
        <div className="flex justify-between items-end pl-2 sm:pl-4 pr-0 pt-2 relative">
          <h2 className="text-[20px] sm:text-[22px] font-bold text-white pb-2 tracking-wide">Resumen general</h2>
          <div className="flex bg-transparent translate-y-[1px]">
            <button 
              onClick={() => setPeriod('today')}
              className={cn(
                "px-4 sm:px-5 py-2 text-[12px] sm:text-[13px] rounded-t-[16px] transition-all min-w-[60px]", 
                period === 'today' ? "bg-white text-[#0BA70B] font-bold" : "text-white hover:text-white/80 font-medium"
              )}
            >
              Hoy
            </button>
            <button 
              onClick={() => setPeriod('7d')}
              className={cn(
                "px-4 sm:px-5 py-2 text-[12px] sm:text-[13px] rounded-t-[16px] transition-all min-w-[60px]", 
                period === '7d' ? "bg-white text-[#0BA70B] font-bold" : "text-white hover:text-white/80 font-medium"
              )}
            >
              Sem
            </button>
            <button 
              onClick={() => setPeriod('30d')}
              className={cn(
                "px-4 sm:px-5 py-2 text-[12px] sm:text-[13px] rounded-t-[16px] transition-all min-w-[60px]", 
                period === '30d' ? "bg-white text-[#0BA70B] font-bold" : "text-white hover:text-white/80 font-medium"
              )}
            >
              Mes
            </button>
          </div>
        </div>

        {/* Main Card */}
        <div className={cn("bg-white rounded-[24px] p-5 sm:p-6 shadow-sm relative", period === '30d' ? "rounded-tr-none" : "")}>
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-2">
              <span className="text-[15px] sm:text-[16px] font-normal text-gray-800">Ingresos</span>
              <button onClick={() => setShowRevenue(!showRevenue)} className="text-[#0BA70B] hover:text-[#0BA70B]/80 transition-colors p-1">
                {showRevenue ? <Eye size={20} strokeWidth={2.5} /> : <EyeOff size={20} strokeWidth={2.5} />}
              </button>
            </div>
            <span className="text-[26px] sm:text-[28px] font-bold text-[#0BA70B] tracking-tight">
              {showRevenue ? `$ ${stats.revenue.toLocaleString()}` : '...'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#eafbea] rounded-[16px] p-2 sm:p-3 flex flex-col items-center justify-center min-h-[95px]">
              <Calendar size={18} className="text-[#0BA70B] mb-1.5" strokeWidth={2.5} />
              <span className="text-[#0BA70B] font-bold text-[11px] sm:text-[12px] mb-1 whitespace-nowrap">Reservas</span>
              <span className="text-[15px] sm:text-[17px] font-bold text-gray-900 leading-none">{stats.todayMatches}</span>
            </div>
            
            <div className="bg-[#eafbea] rounded-[16px] p-2 sm:p-3 flex flex-col items-center justify-center min-h-[95px] text-center">
              <TrendingUp size={18} className="text-[#0BA70B] mb-1.5" strokeWidth={2.5} />
              <span className="text-[#0BA70B] font-bold text-[11px] sm:text-[12px] mb-1 whitespace-nowrap">Modo preferido</span>
              <span className="text-[15px] sm:text-[17px] font-bold text-gray-900 leading-none">
                {stats.preferredGameMode === 'challenge' ? 'Desafío' :
                  stats.preferredGameMode === 'missing_players' ? 'Falta uno' : 'Completo'}
              </span>
            </div>
            
            <div className="bg-[#eafbea] rounded-[16px] p-2 sm:p-3 flex flex-col items-center justify-center min-h-[95px]">
              <Users size={18} className="text-[#0BA70B] mb-1.5" strokeWidth={2.5} />
              <span className="text-[#0BA70B] font-bold text-[11px] sm:text-[12px] mb-1 whitespace-nowrap">Nuevos</span>
              <span className="text-[15px] sm:text-[17px] font-bold text-gray-900 leading-none">{stats.newUsers}</span>
            </div>
          </div>
        </div>
      </div>
"""

content = content.replace(old_section, new_section)

with open("src/App.tsx", "w") as f:
    f.write(content)

