import re

with open("src/App.tsx", "r") as f:
    content = f.read()

# Replace the Main Card content
old_card_content = """        {/* Main Card */}
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
        </div>"""

new_card_content = """        {/* Main Card */}
        <div className={cn("bg-white rounded-[24px] p-5 sm:p-6 shadow-sm relative overflow-hidden", period === '30d' ? "rounded-tr-none" : "")}>
          <AnimatePresence mode="wait">
            <motion.div
              key={period}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
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
            </motion.div>
          </AnimatePresence>
        </div>"""

content = content.replace(old_card_content, new_card_content)

with open("src/App.tsx", "w") as f:
    f.write(content)

