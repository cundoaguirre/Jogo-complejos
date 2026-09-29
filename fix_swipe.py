import re

with open("src/App.tsx", "r") as f:
    content = f.read()

old_states = """const DashboardView = () => {
  const [showRevenue, setShowRevenue] = useState(true);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [period, setPeriod] = useState('today');
  const [direction, setDirection] = useState(1);"""

new_states = """const DashboardView = () => {
  const [showRevenue, setShowRevenue] = useState(true);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [period, setPeriod] = useState('today');
  const [direction, setDirection] = useState(1);
  const dragX = useMotionValue(0);
  const tabX = useTransform(dragX, [-300, 0, 300], [70, 0, -70]);"""

content = content.replace(old_states, new_states)

with open("src/App.tsx", "w") as f:
    f.write(content)
