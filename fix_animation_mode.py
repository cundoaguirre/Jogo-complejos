import re

with open("src/App.tsx", "r") as f:
    content = f.read()

# Fix AnimatePresence mode and motion.div
old_motion = """          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={period}
              custom={direction}
              variants={{
                initial: (dir) => ({ opacity: 0, x: dir === 1 ? 25 : -25 }),
                animate: { opacity: 1, x: 0 },
                exit: (dir) => ({ opacity: 0, x: dir === 1 ? -25 : 25 })
              }}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.15, ease: "easeOut" }}
            >"""

new_motion = """          <AnimatePresence mode="popLayout" custom={direction} initial={false}>
            <motion.div
              key={period}
              custom={direction}
              variants={{
                initial: (dir) => ({ opacity: 0, x: dir === 1 ? 40 : -40 }),
                animate: { opacity: 1, x: 0 },
                exit: (dir) => ({ opacity: 0, x: dir === 1 ? -40 : 40 })
              }}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.25, ease: "easeInOut" }}
            >"""

content = content.replace(old_motion, new_motion)

with open("src/App.tsx", "w") as f:
    f.write(content)

