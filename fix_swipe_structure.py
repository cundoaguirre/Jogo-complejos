import re

with open("src/App.tsx", "r") as f:
    content = f.read()

old_block = """        {/* Main Card */}
        <motion.div 
          animate={{ borderTopRightRadius: period === '30d' ? 0 : 24 }}
          transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
          className="bg-white rounded-[24px] shadow-sm relative overflow-hidden"
        >
          <AnimatePresence mode="popLayout" custom={direction} initial={false}>
            <motion.div
              key={period}
              custom={direction}
              variants={{
                initial: (dir) => ({ opacity: 1, x: dir === 1 ? "100%" : "-100%" }),
                animate: { opacity: 1, x: 0 },
                exit: (dir) => ({ opacity: 1, x: dir === 1 ? "-100%" : "100%" })
              }}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              className="w-full p-5 sm:p-6 cursor-grab active:cursor-grabbing"
              onPanEnd={(e, info) => {
                const threshold = 30;
                const currentIndex = ['today', '7d', '30d'].indexOf(period);
                if (info.offset.x < -threshold && currentIndex < 2) {
                  handleSetPeriod(['today', '7d', '30d'][currentIndex + 1]);
                } else if (info.offset.x > threshold && currentIndex > 0) {
                  handleSetPeriod(['today', '7d', '30d'][currentIndex - 1]);
                }
              }}
            >"""

new_block = """        {/* Main Card */}
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
          >
            <AnimatePresence mode="popLayout" custom={direction} initial={false}>
              <motion.div
                key={period}
                custom={direction}
                variants={{
                  initial: (dir) => ({ opacity: 1, x: dir === 1 ? "100%" : "-100%" }),
                  animate: { opacity: 1, x: 0 },
                  exit: (dir) => ({ opacity: 1, x: dir === 1 ? "-100%" : "100%" })
                }}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                className="w-full p-5 sm:p-6 pointer-events-none"
              >"""

content = content.replace(old_block, new_block)

# Since we added a `<motion.div>` wrapper, we need to add a closing tag
old_end = """              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>"""

new_end = """              </div>
            </motion.div>
          </AnimatePresence>
          </motion.div>
        </motion.div>"""

content = content.replace(old_end, new_end)

with open("src/App.tsx", "w") as f:
    f.write(content)
