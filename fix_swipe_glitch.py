import re

with open("src/App.tsx", "r") as f:
    content = f.read()

old_motion = """              className="w-full p-5 sm:p-6"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={1}
              onDragEnd={(e, info) => {
                const threshold = 20;
                const currentIndex = ['today', '7d', '30d'].indexOf(period);
                if (info.offset.x < -threshold && currentIndex < 2) {
                  handleSetPeriod(['today', '7d', '30d'][currentIndex + 1]);
                } else if (info.offset.x > threshold && currentIndex > 0) {
                  handleSetPeriod(['today', '7d', '30d'][currentIndex - 1]);
                }
              }}
            >"""

new_motion = """              className="w-full p-5 sm:p-6 cursor-grab active:cursor-grabbing"
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

content = content.replace(old_motion, new_motion)

with open("src/App.tsx", "w") as f:
    f.write(content)
