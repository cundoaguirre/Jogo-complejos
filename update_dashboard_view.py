import re

with open("src/App.tsx", "r") as f:
    content = f.read()

# Add EyeOff to imports
if "EyeOff" not in content:
    content = content.replace("Eye", "Eye, EyeOff")

# Find DashboardView definition
dashboard_view_start = content.find('const DashboardView = () => {')

# Add showRevenue state
state_insertion = """  const [showRevenue, setShowRevenue] = useState(true);
"""
if "showRevenue" not in content[dashboard_view_start:dashboard_view_start+200]:
    content = content[:dashboard_view_start+29] + "\n" + state_insertion + content[dashboard_view_start+29:]

# Find the Resumen General section
resumen_start = content.find('{/* Resumen General Section */}')
resumen_end = content.find('      {/* Compact Metrics Grid */}', resumen_start)
if resumen_end == -1:
    resumen_end = content.find('      <div className="grid grid-cols-1 gap-6">', resumen_start)

replacement = """      {/* Resumen General Section */}
      <div className="space-y-0 relative mt-4">
        {/* Title and Tabs Header */}
        <div className="flex justify-between items-end px-2 pt-2 z-10 relative">
          <h2 className="text-xl font-normal text-white pb-2">Resumen general</h2>
          <div className="flex bg-transparent">
            <button 
              onClick={() => setPeriod('today')}
              className={cn(
                "px-4 py-2 text-[13px] font-bold rounded-t-xl transition-all", 
                period === 'today' ? "bg-white text-[#0BA70B]" : "text-white hover:text-white/80"
              )}
            >
              Hoy
            </button>
            <button 
              onClick={() => setPeriod('7d')}
              className={cn(
                "px-4 py-2 text-[13px] font-normal rounded-t-xl transition-all", 
                period === '7d' ? "bg-white text-[#0BA70B]" : "text-white hover:text-white/80"
              )}
            >
              Sem
            </button>
            <button 
              onClick={() => setPeriod('30d')}
              className={cn(
                "px-4 py-2 text-[13px] font-normal rounded-t-xl transition-all", 
                period === '30d' ? "bg-white text-[#0BA70B]" : "text-white hover:text-white/80"
              )}
            >
              Mes
            </button>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-[16px] rounded-tr-none p-5 sm:p-6 shadow-sm relative z-0">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
              <span className="text-lg font-normal text-gray-800">Ingresos</span>
              <button onClick={() => setShowRevenue(!showRevenue)} className="text-[#0BA70B] hover:text-[#0BA70B]/80 transition-colors">
                {showRevenue ? <Eye size={20} /> : <EyeOff size={20} />}
              </button>
            </div>
            <span className="text-3xl font-semibold text-[#0BA70B]">
              {showRevenue ? `$ ${stats.revenue.toLocaleString()}` : '-'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#eafbea] rounded-xl p-3 flex flex-col items-center justify-center min-h-[90px]">
              <span className="text-[#0BA70B] font-bold text-[13px] mb-1">Reservas</span>
              <span className="text-lg font-semibold text-[#0BA70B]">{stats.todayMatches}</span>
            </div>
            
            <div className="bg-[#eafbea] rounded-xl p-3 flex flex-col items-center justify-center min-h-[90px] text-center">
              <span className="text-[#0BA70B] font-bold text-[13px] mb-1 leading-tight">Modo preferido</span>
              <span className="text-[13px] font-semibold text-[#0BA70B]">
                {stats.preferredGameMode === 'challenge' ? 'Desafío' :
                  stats.preferredGameMode === 'missing_players' ? 'Falta uno' : 'Completo'}
              </span>
            </div>
            
            <div className="bg-[#eafbea] rounded-xl p-3 flex flex-col items-center justify-center min-h-[90px]">
              <span className="text-[#0BA70B] font-bold text-[13px] mb-1">Nuevos</span>
              <span className="text-lg font-semibold text-[#0BA70B]">{stats.newUsers}</span>
            </div>
          </div>
        </div>
      </div>
"""

content = content[:resumen_start] + replacement + "\n" + content[resumen_end:]

with open("src/App.tsx", "w") as f:
    f.write(content)
print("Success")
