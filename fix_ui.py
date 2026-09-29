import re

with open("src/App.tsx", "r") as f:
    content = f.read()

# Fix the Header
header_start = content.find('<header className="')
if header_start != -1:
    header_end = content.find('</header>', header_start) + 9
    new_header = """<header className="bg-[#0BA70B] dark:bg-[#0BA70B] h-20 flex items-center justify-between px-4 md:px-6 text-white z-20 relative">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="text-white hover:text-white/80 transition-colors p-1 -ml-1">
              <Menu size={32} strokeWidth={2.5} />
            </button>
            <h2 className="text-[26px] font-bold tracking-wide">
              {activeTab === 'dashboard' ? 'Hola, admin!' : 
               activeTab === 'schedule' ? 'Agenda' :
               activeTab === 'users' ? 'Usuarios' :
               activeTab === 'finance' ? 'Finanzas' :
               activeTab === 'profile' ? 'Perfil' : activeTab}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={toggleDarkMode} className="p-2 text-white hover:text-white/80 transition-colors">
              {isDarkMode ? <Sun size={24} /> : <Moon size={24} />}
            </button>
            <button className="relative p-2 text-white hover:text-white/80 transition-colors">
              <Bell size={24} />
              <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#0BA70B]"></span>
            </button>
          </div>
        </header>"""
    content = content[:header_start] + new_header + content[header_end:]

# Fix the DashboardView
dashboard_start = content.find('const DashboardView = () => {')
if dashboard_start != -1:
    resumen_start = content.find('{/* Background Gradient Extension */}', dashboard_start)
    if resumen_start == -1:
        resumen_start = content.find('{/* Resumen General Section */}', dashboard_start)
        
    resumen_end = content.find('      <div className="grid grid-cols-1 gap-6 relative z-10">', resumen_start)
    
    replacement = """{/* Background Gradient Extension */}
      <div className="absolute top-0 left-0 right-0 h-[280px] bg-gradient-to-b from-[#0BA70B] from-60% to-transparent z-0 pointer-events-none"></div>

      {/* Resumen General Section */}
      <div className="space-y-0 relative mt-4 z-10">
        {/* Title and Tabs Header */}
        <div className="flex justify-between items-end px-1 sm:px-2 pt-2 relative">
          <h2 className="text-[24px] font-normal text-white pb-2.5 tracking-wide">Resumen general</h2>
          <div className="flex bg-transparent">
            <button 
              onClick={() => setPeriod('today')}
              className={cn(
                "px-4 sm:px-5 py-2.5 text-[15px] rounded-t-[16px] transition-all min-w-[70px]", 
                period === 'today' ? "bg-white text-[#0BA70B] font-bold" : "text-white hover:text-white/80 font-medium"
              )}
            >
              Hoy
            </button>
            <button 
              onClick={() => setPeriod('7d')}
              className={cn(
                "px-4 sm:px-5 py-2.5 text-[15px] rounded-t-[16px] transition-all min-w-[70px]", 
                period === '7d' ? "bg-white text-[#0BA70B] font-bold" : "text-white hover:text-white/80 font-medium"
              )}
            >
              Sem
            </button>
            <button 
              onClick={() => setPeriod('30d')}
              className={cn(
                "px-4 sm:px-5 py-2.5 text-[15px] rounded-t-[16px] transition-all min-w-[70px]", 
                period === '30d' ? "bg-white text-[#0BA70B] font-bold" : "text-white hover:text-white/80 font-medium"
              )}
            >
              Mes
            </button>
          </div>
        </div>

        {/* Main Card */}
        <div className={cn("bg-white rounded-[24px] p-5 sm:p-6 shadow-sm relative", period === '30d' ? "rounded-tr-none" : "")}>
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
              <span className="text-[20px] font-normal text-gray-800">Ingresos</span>
              <button onClick={() => setShowRevenue(!showRevenue)} className="text-[#0BA70B] hover:text-[#0BA70B]/80 transition-colors p-1">
                {showRevenue ? <Eye size={22} strokeWidth={2.5} /> : <EyeOff size={22} strokeWidth={2.5} />}
              </button>
            </div>
            <span className="text-4xl font-bold text-[#0BA70B] tracking-tight">
              {showRevenue ? `$ ${stats.revenue.toLocaleString()}` : '...'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#eafbea] rounded-[16px] p-3 sm:p-4 flex flex-col items-center justify-center min-h-[100px]">
              <Calendar size={22} className="text-[#0BA70B] mb-2" strokeWidth={2} />
              <span className="text-[#0BA70B] font-bold text-[14px] sm:text-[15px] mb-1.5">Reservas</span>
              <span className="text-xl sm:text-2xl font-bold text-gray-900">{stats.todayMatches}</span>
            </div>
            
            <div className="bg-[#eafbea] rounded-[16px] p-3 sm:p-4 flex flex-col items-center justify-center min-h-[100px] text-center">
              <TrendingUp size={22} className="text-[#0BA70B] mb-2" strokeWidth={2} />
              <span className="text-[#0BA70B] font-bold text-[13px] sm:text-[15px] mb-1.5 leading-tight">Modo preferido</span>
              <span className="text-[14px] sm:text-[16px] font-bold text-gray-900">
                {stats.preferredGameMode === 'challenge' ? 'Desafío' :
                  stats.preferredGameMode === 'missing_players' ? 'Falta uno' : 'Completo'}
              </span>
            </div>
            
            <div className="bg-[#eafbea] rounded-[16px] p-3 sm:p-4 flex flex-col items-center justify-center min-h-[100px]">
              <Users size={22} className="text-[#0BA70B] mb-2" strokeWidth={2} />
              <span className="text-[#0BA70B] font-bold text-[14px] sm:text-[15px] mb-1.5">Nuevos</span>
              <span className="text-xl sm:text-2xl font-bold text-gray-900">{stats.newUsers}</span>
            </div>
          </div>
        </div>
      </div>
"""
    content = content[:resumen_start] + replacement + "\n      " + content[resumen_end:]

with open("src/App.tsx", "w") as f:
    f.write(content)

