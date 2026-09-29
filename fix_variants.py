import re

with open("src/App.tsx", "r") as f:
    content = f.read()

old_motion = """          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={period}
              custom={direction}
              initial={(dir) => ({ opacity: 0, x: dir === 1 ? 15 : -15 })}
              animate={{ opacity: 1, x: 0 }}
              exit={(dir) => ({ opacity: 0, x: dir === 1 ? -15 : 15 })}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >"""

new_motion = """          <AnimatePresence mode="wait" custom={direction}>
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

content = content.replace(old_motion, new_motion)

with open("src/App.tsx", "w") as f:
    f.write(content)
