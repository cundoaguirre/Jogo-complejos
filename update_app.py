import re

with open("src/App.tsx", "r") as f:
    content = f.read()

# Update Header
header_start = content.find('<header className="bg-emerald-600')
if header_start != -1:
    header_end = content.find('</header>', header_start) + 9
    
    new_header = """<header className="bg-[#0BA70B] dark:bg-[#0BA70B] h-20 flex items-center justify-between px-4 md:px-6 transition-colors text-white z-20 relative">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="text-white hover:text-white/80 transition-colors">
              <Menu size={32} strokeWidth={2.5} />
            </button>
            <h2 className="text-[22px] font-bold">
              {activeTab === 'dashboard' ? 'Hola, admin!' : 
               activeTab === 'schedule' ? 'Agenda' :
               activeTab === 'users' ? 'Usuarios' :
               activeTab === 'finance' ? 'Finanzas' :
               activeTab === 'profile' ? 'Perfil' : activeTab}
            </h2>
          </div>
          <div className="flex items-center gap-4 hidden lg:flex">
            <button onClick={toggleDarkMode} className="p-2 text-white hover:text-white/80 transition-colors">
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button className="relative p-2 text-white hover:text-white/80 transition-colors">
              <Bell size={20} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-[#0BA70B]"></span>
            </button>
          </div>
        </header>"""
    content = content[:header_start] + new_header + content[header_end:]

# Ensure main has a light background to blend the gradient
main_start = content.find('<main className="flex-1')
if main_start != -1:
    content = content.replace('<main className="flex-1 overflow-y-auto p-3 md:p-6 pb-24 lg:pb-6">', '<main className="flex-1 overflow-y-auto p-3 md:p-6 pb-24 lg:pb-6 bg-[#f0f2f5] dark:bg-slate-900 relative">')

# Update DashboardView
dashboard_view_start = content.find('const DashboardView = () => {')
if dashboard_view_start != -1:
    resumen_start = content.find('{/* Resumen General Section */}', dashboard_view_start)
    resumen_end = content.find('      {/* Compact Metrics Grid */}', resumen_start)
    if resumen_end == -1:
        resumen_end = content.find('      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">', resumen_start)
    if resumen_end == -1:
         resumen_end = content.find('      <div className="grid grid-cols-1 gap-6">', resumen_start)
    
    replacement = """{/* Background Gradient Extension */}
      <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-[#0BA70B] via-[#0BA70B]/90 to-transparent z-0 pointer-events-none"></div>

      {/* Resumen General Section */}
      <div className="space-y-0 relative mt-2 z-10">
        {/* Title and Tabs Header */}
        <div className="flex justify-between items-end px-2 pt-2 relative">
          <h2 className="text-[22px] font-normal text-white pb-2">Resumen general</h2>
          <div className="flex bg-transparent">
            <button 
              onClick={() => setPeriod('today')}
              className={cn(
                "px-4 py-2 text-[14px] font-bold rounded-t-xl transition-all", 
                period === 'today' ? "bg-white text-[#0BA70B]" : "text-white hover:text-white/80 font-normal"
              )}
            >
              Hoy
            </button>
            <button 
              onClick={() => setPeriod('7d')}
              className={cn(
                "px-4 py-2 text-[14px] rounded-t-xl transition-all", 
                period === '7d' ? "bg-white text-[#0BA70B] font-bold" : "text-white hover:text-white/80 font-normal"
              )}
            >
              Sem
            </button>
            <button 
              onClick={() => setPeriod('30d')}
              className={cn(
                "px-4 py-2 text-[14px] rounded-t-xl transition-all", 
                period === '30d' ? "bg-white text-[#0BA70B] font-bold" : "text-white hover:text-white/80 font-normal"
              )}
            >
              Mes
            </button>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-[16px] rounded-tr-none p-5 sm:p-6 shadow-sm relative">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
              <span className="text-xl font-normal text-gray-800">Ingresos</span>
              <button onClick={() => setShowRevenue(!showRevenue)} className="text-[#0BA70B] hover:text-[#0BA70B]/80 transition-colors p-1">
                {showRevenue ? <Eye size={20} strokeWidth={2.5} /> : <EyeOff size={20} strokeWidth={2.5} />}
              </button>
            </div>
            <span className="text-3xl font-semibold text-[#0BA70B]">
              {showRevenue ? `$ ${stats.revenue.toLocaleString()}` : '...'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#eafbea] rounded-[14px] p-3 flex flex-col items-center justify-center min-h-[90px]">
              <span className="text-[#0BA70B] font-bold text-[14px] mb-2">Reservas</span>
              <span className="text-xl font-semibold text-[#0BA70B]">{stats.todayMatches}</span>
            </div>
            
            <div className="bg-[#eafbea] rounded-[14px] p-3 flex flex-col items-center justify-center min-h-[90px] text-center">
              <span className="text-[#0BA70B] font-bold text-[14px] mb-2 leading-tight">Modo preferido</span>
              <span className="text-[14px] font-semibold text-[#0BA70B]">
                {stats.preferredGameMode === 'challenge' ? 'Desafío' :
                  stats.preferredGameMode === 'missing_players' ? 'Falta uno' : 'Completo'}
              </span>
            </div>
            
            <div className="bg-[#eafbea] rounded-[14px] p-3 flex flex-col items-center justify-center min-h-[90px]">
              <span className="text-[#0BA70B] font-bold text-[14px] mb-2">Nuevos</span>
              <span className="text-xl font-semibold text-[#0BA70B]">{stats.newUsers}</span>
            </div>
          </div>
        </div>
      </div>
"""
    content = content[:resumen_start] + replacement + "\n      " + content[resumen_end:]

with open("src/App.tsx", "w") as f:
    f.write(content)
print("Success")
