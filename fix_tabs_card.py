import re

with open("src/App.tsx", "r") as f:
    content = f.read()

# 1. Update imports
content = content.replace(
    "import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react';",
    "import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'motion/react';"
)

# 2. Update DashboardView state
old_state = """  const [direction, setDirection] = useState(1);
  const dragX = useMotionValue(0);
  const tabX = useTransform(dragX, [-320, 0, 320], [85, 0, -85]);

  const handleSetPeriod = (newPeriod: string) => {"""

new_state = """  const [direction, setDirection] = useState(1);
  const dragX = useMotionValue(0);
  const tabX = useSpring(0, { stiffness: 400, damping: 30 });
  const cardBorderRadius = useTransform(tabX, [76, 152], [24, 0]);

  useEffect(() => {
    tabX.set(period === 'today' ? 0 : period === '7d' ? 76 : 152);
  }, [period, tabX]);

  const handleSetPeriod = (newPeriod: string) => {"""

content = content.replace(old_state, new_state)

# 3. Update the Tabs structure
old_tabs_start = """          <div className="flex bg-transparent translate-y-[1px]">
            {['today', '7d', '30d'].map((p) => (
              <button 
                key={p}
                onClick={() => handleSetPeriod(p)}
                className={cn(
                  "relative px-4 sm:px-5 py-2 text-[12px] sm:text-[13px] rounded-t-[16px] transition-colors min-w-[60px] z-10", 
                  period === p ? "text-[#0BA70B] font-bold" : "text-white hover:text-white/80 font-medium"
                )}
              >
                {period === p && (
                  <motion.div
                    layoutId="activeTabBackground"
                    className="absolute inset-0 bg-white rounded-t-[16px] -z-10"
                    style={{ x: tabX }}
                    transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                  />
                )}
                {p === 'today' ? 'Hoy' : p === '7d' ? 'Sem' : 'Mes'}
              </button>
            ))}
          </div>"""

new_tabs = """          <div className="relative flex bg-transparent translate-y-[1px] w-[228px] h-[36px]">
            {/* Base Tabs (White text) */}
            <div className="absolute inset-0 flex">
              {['today', '7d', '30d'].map((p) => (
                <button 
                  key={p}
                  onClick={() => handleSetPeriod(p)}
                  className="w-[76px] h-full text-[12px] sm:text-[13px] font-medium text-white hover:text-white/80 transition-colors z-10"
                >
                  {p === 'today' ? 'Hoy' : p === '7d' ? 'Sem' : 'Mes'}
                </button>
              ))}
            </div>

            {/* Sliding Window (White Bg, Green Text) */}
            <motion.div 
              style={{ x: tabX }}
              className="absolute top-0 bottom-0 left-0 w-[76px] bg-white rounded-t-[16px] overflow-hidden z-20 pointer-events-none"
            >
              <motion.div 
                style={{ x: useTransform(tabX, (val) => -val) }}
                className="flex w-[228px] h-full"
              >
                {['today', '7d', '30d'].map((p) => (
                  <div key={p} className="w-[76px] h-full flex items-center justify-center text-[12px] sm:text-[13px] font-bold text-[#0BA70B]">
                    {p === 'today' ? 'Hoy' : p === '7d' ? 'Sem' : 'Mes'}
                  </div>
                ))}
              </motion.div>
            </motion.div>
          </div>"""

content = content.replace(old_tabs_start, new_tabs)

# 4. Update Main Card Drag
old_card = """        {/* Main Card */}
        <motion.div 
          animate={{ borderTopRightRadius: period === '30d' ? 0 : 24 }}
          transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
          className="bg-white rounded-[24px] shadow-sm relative overflow-hidden"
        >
          <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={1}
            style={{ x: dragX }}
            onDragEnd={(e, info) => {
              const threshold = 30;
              const currentIndex = ['today', '7d', '30d'].indexOf(period);
              if (info.offset.x < -threshold && currentIndex < 2) {
                handleSetPeriod(['today', '7d', '30d'][currentIndex + 1]);
              } else if (info.offset.x > threshold && currentIndex > 0) {
                handleSetPeriod(['today', '7d', '30d'][currentIndex - 1]);
              }
            }}
            className="w-full cursor-grab active:cursor-grabbing"
          >"""

new_card = """        {/* Main Card */}
        <motion.div 
          style={{ borderTopRightRadius: cardBorderRadius }}
          className="bg-white rounded-tl-[24px] rounded-b-[24px] shadow-sm relative overflow-hidden"
        >
          <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={1}
            style={{ x: dragX }}
            onDrag={(e, info) => {
              const base = period === 'today' ? 0 : period === '7d' ? 76 : 152;
              let newX = base - (info.offset.x * (76 / window.innerWidth)); 
              newX = Math.max(0, Math.min(152, newX));
              tabX.set(newX);
            }}
            onDragEnd={(e, info) => {
              const threshold = 30;
              const currentIndex = ['today', '7d', '30d'].indexOf(period);
              if (info.offset.x < -threshold && currentIndex < 2) {
                handleSetPeriod(['today', '7d', '30d'][currentIndex + 1]);
              } else if (info.offset.x > threshold && currentIndex > 0) {
                handleSetPeriod(['today', '7d', '30d'][currentIndex - 1]);
              } else {
                tabX.set(period === 'today' ? 0 : period === '7d' ? 76 : 152);
              }
            }}
            className="w-full cursor-grab active:cursor-grabbing"
          >"""

content = content.replace(old_card, new_card)

with open("src/App.tsx", "w") as f:
    f.write(content)
