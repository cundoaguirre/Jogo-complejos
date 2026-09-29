import re

with open("src/App.tsx", "r") as f:
    content = f.read()

old_bg = """                  <motion.div
                    layoutId="activeTabBackground"
                    className="absolute inset-0 bg-white rounded-t-[16px] -z-10"
                    transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                  />"""

new_bg = """                  <motion.div
                    layoutId="activeTabBackground"
                    className="absolute inset-0 bg-white rounded-t-[16px] -z-10"
                    style={{ x: tabX }}
                    transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                  />"""

content = content.replace(old_bg, new_bg)

with open("src/App.tsx", "w") as f:
    f.write(content)
