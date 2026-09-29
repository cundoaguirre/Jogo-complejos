import re

with open("src/App.tsx", "r") as f:
    content = f.read()

# 1. extract invertedTabX
old_state = """  const [direction, setDirection] = useState(1);
  const dragX = useMotionValue(0);
  const rawTabX = useMotionValue(0);
  const tabX = useSpring(rawTabX, { stiffness: 400, damping: 30 });
  const cardBorderRadius = useTransform(tabX, [76, 152], [24, 0]);

  useEffect(() => {"""

new_state = """  const [direction, setDirection] = useState(1);
  const dragX = useMotionValue(0);
  const rawTabX = useMotionValue(0);
  const tabX = useSpring(rawTabX, { stiffness: 400, damping: 30 });
  const invertedTabX = useTransform(tabX, (val) => -val);
  const cardBorderRadius = useTransform(tabX, [76, 152], [24, 0]);

  useEffect(() => {"""

content = content.replace(old_state, new_state)

# 2. replace in JSX
old_jsx = """              <motion.div 
                style={{ x: useTransform(tabX, (val) => -val) }}
                className="flex w-[228px] h-full"
              >"""

new_jsx = """              <motion.div 
                style={{ x: invertedTabX }}
                className="flex w-[228px] h-full"
              >"""

content = content.replace(old_jsx, new_jsx)

with open("src/App.tsx", "w") as f:
    f.write(content)
