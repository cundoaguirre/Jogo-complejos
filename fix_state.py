import re

with open("src/App.tsx", "r") as f:
    content = f.read()

old_state = """  const [direction, setDirection] = useState(1);
  const dragX = useMotionValue(0);
  const tabX = useSpring(0, { stiffness: 400, damping: 30 });
  const cardBorderRadius = useTransform(tabX, [76, 152], [24, 0]);

  useEffect(() => {
    tabX.set(period === 'today' ? 0 : period === '7d' ? 76 : 152);
  }, [period, tabX]);"""

new_state = """  const [direction, setDirection] = useState(1);
  const dragX = useMotionValue(0);
  const rawTabX = useMotionValue(0);
  const tabX = useSpring(rawTabX, { stiffness: 400, damping: 30 });
  const cardBorderRadius = useTransform(tabX, [76, 152], [24, 0]);

  useEffect(() => {
    rawTabX.set(period === 'today' ? 0 : period === '7d' ? 76 : 152);
  }, [period, rawTabX]);"""

content = content.replace(old_state, new_state)

old_drag = """            onDrag={(e, info) => {
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
            }}"""

new_drag = """            onDrag={(e, info) => {
              const base = period === 'today' ? 0 : period === '7d' ? 76 : 152;
              let newX = base - (info.offset.x * (76 / window.innerWidth)); 
              newX = Math.max(0, Math.min(152, newX));
              rawTabX.set(newX);
            }}
            onDragEnd={(e, info) => {
              const threshold = 30;
              const currentIndex = ['today', '7d', '30d'].indexOf(period);
              if (info.offset.x < -threshold && currentIndex < 2) {
                handleSetPeriod(['today', '7d', '30d'][currentIndex + 1]);
              } else if (info.offset.x > threshold && currentIndex > 0) {
                handleSetPeriod(['today', '7d', '30d'][currentIndex - 1]);
              } else {
                rawTabX.set(period === 'today' ? 0 : period === '7d' ? 76 : 152);
              }
            }}"""

content = content.replace(old_drag, new_drag)

with open("src/App.tsx", "w") as f:
    f.write(content)
