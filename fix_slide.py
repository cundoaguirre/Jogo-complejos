import re

with open("src/App.tsx", "r") as f:
    content = f.read()

old_motion = """          <AnimatePresence mode="popLayout" custom={direction} initial={false}>
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

new_motion = """          <AnimatePresence mode="popLayout" custom={direction} initial={false}>
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
              transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
              className="w-full"
            >"""

content = content.replace(old_motion, new_motion)

with open("src/App.tsx", "w") as f:
    f.write(content)
