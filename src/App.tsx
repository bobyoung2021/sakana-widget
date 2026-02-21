import { useEffect, useRef } from "react"
import SakanaWidget from "sakana-widget"
import "sakana-widget/lib/index.css"
import "./App.css"

// 扩展 Window 接口，声明 Flutter 调用的全局方法
interface ImageMap {
  SAKANA?: string
  bgColor?: string
}

// 加速度历史数据类型
interface AccelData {
  x: number
  y: number
  z: number
  time: number
}

// 姿态历史数据类型
interface OrientData {
  beta: number
  gamma: number
  time: number
}

declare global {
  interface Window {
    applyShake: (x: number, y: number, z: number) => void
    applyAcceleration: (x: number, y: number, z: number) => void
    applyOrientation: (alpha: number, beta: number, gamma: number) => void
    setImageMap: (imageMap: ImageMap) => void
  }
}

// 车辆运动状态检测配置（与原始版本一致）
const MOTION_CONFIG = {
  // 行驶中振动阈值（标准差）
  DRIVING_THRESHOLD: 0.15,
  // 停止振动阈值
  STOPPED_THRESHOLD: 0.08,
  // 持续激励间隔（毫秒）
  EXCITATION_INTERVAL: 150,
  // 历史数据窗口（毫秒）
  HISTORY_WINDOW: 1000,
  // 最小数据量
  MIN_DATA_COUNT: 5,
}

function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<SakanaWidget | null>(null)

  // 车辆运动状态
  const isVehicleMovingRef = useRef(false)
  const movingStartTimeRef = useRef<number>(0)
  const lastExciteTimeRef = useRef<number>(0)
  const exciteCounterRef = useRef<number>(0)

  // 加速度历史数据（带时间戳，用于滑动窗口）
  const accelHistoryRef = useRef<AccelData[]>([])

  // 姿态历史数据
  const prevOrientRef = useRef<OrientData>({ beta: 0, gamma: -90, time: 0 })

  useEffect(() => {
    if (!containerRef.current) return

    // 初始化姿态历史数据的时间戳
    prevOrientRef.current.time = Date.now()

    // 获取 Flutter 传入的图片 URL（通过 URL 参数）
    const urlParams = new URLSearchParams(window.location.search)
    const rawImageParam = urlParams.get("image")
    let imageUrl = ""
    if (rawImageParam) {
      if (rawImageParam.startsWith("data:image/")) {
        imageUrl = rawImageParam
      } else {
        try {
          imageUrl = decodeURIComponent(rawImageParam)
        } catch (error) {
          console.warn("⚠️ 初始图片解码失败，使用原值", rawImageParam, error)
          imageUrl = rawImageParam
        }
      }
      console.log("🖼️ 初始图片:", imageUrl)
    }

    // 创建自定义角色
    const customCharacter = SakanaWidget.getCharacter("takina")
    if (imageUrl) {
      customCharacter.image = imageUrl
    }
    SakanaWidget.registerCharacter("custom", customCharacter)

    // 初始化 Sakana Widget
    const widget = new SakanaWidget({
      character: "custom",
      autoFit: true,
      controls: false,
      draggable: true,
      rod: true,
      size: 280,
      stroke: { color: "#b0b0b0", width: 8 },
    })
      .setState({
        // 设置初始状态为平衡点，避免启动时自动摆动
        r: 0,
        y: 0,
        t: 0,
        w: 0,
      })
      .mount(containerRef.current)

    // 使用原始尺寸，缩小到80%
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sakana = widget as any
    sakana._draw = () => {
      const { r, y } = sakana._state
      const { size, controls, stroke, rod } = sakana._options
      const img = sakana._domImage
      const ctx = sakana._domCanvasCtx
      if (!img || !ctx) return
      const x = r

      // 圖片使用原始尺寸和位置，放大到115%
      img.style.transform = `rotate(${r}deg) translateX(${x}px) translateY(${y}px) scale(0.9)`

      ctx.clearRect(0, 0, sakana._canvasSize, sakana._canvasSize)
      ctx.save()
      ctx.translate(sakana._canvasSize / 2, size + (sakana._canvasSize - size) / 2)
      ctx.strokeStyle = stroke.color
      ctx.lineWidth = stroke.width
      ctx.lineCap = "round"
      if (rod) {
        ctx.beginPath()
      }
      ctx.moveTo(0, controls ? -10 : 70)
      if (rod) {
        const radius = size - sakana._imageSize / 2
        const { nx, ny } = sakana._calcCenterPoint(r, radius, x, y)
        ctx.lineTo(nx, -ny)
        ctx.stroke()
      }
      ctx.restore()
    }
    sakana._draw()

    widgetRef.current = widget

    // 初始化后自动启动物理引擎
    // 给一个较大的初始扰动，让摆件开始摆动
    setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = widgetRef.current as any
      if (!w) return

      // 设置初始摆动状态（类似于轻轻拨动一下）
      w._state.r = 12
      w._state.y = 2
      w._state.w = 8
      w._state.t = 5

      // 启动物理引擎
      if (!w._running) {
        w._running = true
        requestAnimationFrame(w._run)
        console.log("🚀 物理引擎已自动启动，初始摆动已设置")
      }
    }, 200)

    // 计算标准差（振动强度）
    const calcVariance = (values: number[]): number => {
      if (values.length === 0) return 0
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
      return Math.sqrt(variance)
    }

    // 启动物理引擎
    const startPhysicsEngine = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = widgetRef.current as any
      if (w && !w._running) {
        w._running = true
        requestAnimationFrame(w._run)
      }
    }

    // 设置图片
    const setSakanaImage = (url: string) => {
      if (!widgetRef.current) {
        console.error("❌ widget 对象不存在！")
        return
      }
      if (!url) {
        console.warn("⚠️ 设置图片失败：URL 为空")
        return
      }

      const newCharacter = SakanaWidget.getCharacter("takina")
      newCharacter.image = url
      SakanaWidget.registerCharacter("custom-new", newCharacter)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = widgetRef.current as any
      w.setCharacter("custom-new")

      console.log(`🖼️ 图片已更新: ${url}`)
    }

    // Flutter 注入接口：陀螺仪摇晃数据（手动摇晃触发）
    window.applyShake = (x: number, y: number, z: number) => {
      if (!widgetRef.current) {
        console.error("❌ widget 对象不存在！")
        return
      }

      // 计算总角速度
      const totalVelocity = Math.sqrt(x * x + y * y + z * z)

      // 过滤小震动（阈值降低到 1.5 rad/s，更灵敏）
      if (totalVelocity < 1.5) return

      // 交换映射：X 和 Y 轴效果互换
      const baseMultiplier = Math.min(totalVelocity * 3, 15)

      // 左右晃动设备（X轴数据）→ 希望小的前后效果 → 用小倍数控制 t
      const forceT = x * baseMultiplier * 0.3

      // 前后晃动设备（Y轴数据）→ 希望大的左右效果 → 用大倍数控制 w
      const forceW = y * baseMultiplier * 2.5

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = widgetRef.current as any

      // 获取当前状态（调试用）
      const currentState = w._state
      console.log(
        `📍 施加前状态: r=${currentState.r.toFixed(2)}, y=${currentState.y.toFixed(
          2,
        )}, w=${currentState.w.toFixed(2)}, t=${currentState.t.toFixed(2)}`,
      )

      // 直接修改状态（绕过 setState）
      w._state.w = forceW
      w._state.t = forceT

      // 强制启动物理引擎
      startPhysicsEngine()

      console.log(
        `🔄 摇晃: X=${x.toFixed(2)}, Y=${y.toFixed(2)}, Z=${z.toFixed(
          2,
        )}, 强度=${totalVelocity.toFixed(2)}, 基础倍数=${baseMultiplier.toFixed(
          2,
        )}, 施力W=${forceW.toFixed(2)}(Y×2.5), T=${forceT.toFixed(2)}(X×0.3)`,
      )
    }

    // Flutter 注入接口：加速度计数据（车辆运动状态检测）[主力]
    window.applyAcceleration = (x: number, y: number, z: number) => {
      if (!widgetRef.current) return

      const now = Date.now()

      // 1. 记录加速度历史（滑动窗口：最近1秒的数据）
      accelHistoryRef.current.push({ x, y, z, time: now })
      // 保留最近1秒的数据
      accelHistoryRef.current = accelHistoryRef.current.filter(
        (d) => now - d.time < MOTION_CONFIG.HISTORY_WINDOW,
      )

      // 2. 计算加速度的变化程度（标准差）
      if (accelHistoryRef.current.length < MOTION_CONFIG.MIN_DATA_COUNT) return // 数据不足

      const xValues = accelHistoryRef.current.map((d) => d.x)
      const yValues = accelHistoryRef.current.map((d) => d.y)
      const zValues = accelHistoryRef.current.map((d) => d.z)

      const xVariance = calcVariance(xValues)
      const yVariance = calcVariance(yValues)
      const zVariance = calcVariance(zValues)

      // 总振动强度
      const totalVariance = Math.sqrt(
        xVariance * xVariance + yVariance * yVariance + zVariance * zVariance,
      )

      // 3. 判断车辆运动状态
      if (totalVariance > MOTION_CONFIG.DRIVING_THRESHOLD) {
        if (!isVehicleMovingRef.current) {
          isVehicleMovingRef.current = true
          movingStartTimeRef.current = now
          console.log(`🚗 车辆开始行驶，振动强度=${totalVariance.toFixed(3)}`)
        }
      } else if (totalVariance < MOTION_CONFIG.STOPPED_THRESHOLD) {
        if (isVehicleMovingRef.current) {
          isVehicleMovingRef.current = false
          const movingDuration = ((now - movingStartTimeRef.current) / 1000).toFixed(1)
          console.log(`🛑 车辆停止，行驶时长=${movingDuration}秒`)
        }
      }

      // 4. 如果车辆在行驶中，持续施加小的激励力
      if (isVehicleMovingRef.current) {
        if (now - lastExciteTimeRef.current > MOTION_CONFIG.EXCITATION_INTERVAL) {
          lastExciteTimeRef.current = now

          // 基于振动强度计算激励力
          const exciteStrength = Math.min(totalVariance * 15, 3.0)

          // 使用最近的加速度变化作为激励方向
          const recentData = accelHistoryRef.current.slice(-3)
          let avgDx = 0
          let avgDy = 0
          if (recentData.length > 1) {
            for (let i = 1; i < recentData.length; i++) {
              avgDx += recentData[i].x - recentData[i - 1].x
              avgDy += recentData[i].y - recentData[i - 1].y
            }
            avgDx /= recentData.length - 1
            avgDy /= recentData.length - 1
          }

          // 施加激励力（累加模式，保持自然摆动）
          const lateralForce = avgDx * exciteStrength * 8
          const longitudinalForce = avgDy * exciteStrength * 5

          // 添加随机扰动，让摆动更自然
          const randomFactor = 0.3
          const randomW = (Math.random() - 0.5) * randomFactor * exciteStrength
          const randomT = (Math.random() - 0.5) * randomFactor * exciteStrength

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w = widgetRef.current as any
          w._state.w += lateralForce + randomW
          w._state.t += longitudinalForce + randomT

          // 限制最大值
          const maxW = 25
          const maxT = 18
          w._state.w = Math.max(-maxW, Math.min(maxW, w._state.w))
          w._state.t = Math.max(-maxT, Math.min(maxT, w._state.t))

          // 保持物理引擎运行
          startPhysicsEngine()

          // 每20次激励打印一次日志
          exciteCounterRef.current++
          if (exciteCounterRef.current % 20 === 0) {
            console.log(
              `💨 持续激励[${exciteCounterRef.current}]: 振动=${totalVariance.toFixed(
                3,
              )}, 强度=${exciteStrength.toFixed(2)}, W=${w._state.w.toFixed(
                2,
              )}, T=${w._state.t.toFixed(2)}`,
            )
          }
        }
      }

      // 5. 如果车辆停止，不施加激励，让摆件自然衰减
      // SakanaWidget 自带的阻尼系统会让摆件逐渐停止
    }

    // Flutter 注入接口：设备姿态数据（辅助增强）
    window.applyOrientation = (_alpha: number, beta: number, gamma: number) => {
      if (!widgetRef.current) return

      // 只在车辆行驶中才响应姿态变化
      if (!isVehicleMovingRef.current) return

      const now = Date.now()

      // 计算姿态变化
      const betaChange = beta - prevOrientRef.current.beta
      const gammaChange = gamma - prevOrientRef.current.gamma

      // 如果姿态变化明显（转弯、刹车），增强激励
      const changeThreshold = 0.5 // 降低阈值，更容易响应
      if (Math.abs(betaChange) > changeThreshold || Math.abs(gammaChange) > changeThreshold) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = widgetRef.current as any

        // 施加额外的激励力（叠加到加速度计的效果）
        const orientStrength = 0.8
        w._state.w += gammaChange * orientStrength * 3
        w._state.t += betaChange * orientStrength * 2

        // 限制最大值
        const maxW = 30
        const maxT = 22
        w._state.w = Math.max(-maxW, Math.min(maxW, w._state.w))
        w._state.t = Math.max(-maxT, Math.min(maxT, w._state.t))
      }

      // 更新历史数据
      prevOrientRef.current = { beta, gamma, time: now }
    }

    // Flutter 注入接口：设置图片映射
    window.setImageMap = (imageMap: ImageMap) => {
      console.log("🖼️ 收到图片:", Object.keys(imageMap))

      if (imageMap.SAKANA) {
        setSakanaImage(imageMap.SAKANA)
      }
      if (imageMap.bgColor) {
        document.body.style.backgroundImage = `url(${imageMap.bgColor})`
      }
    }

    console.log("✅ Sakana Widget v2.6 已就绪，等待传感器数据...")
    console.log("📱 传感器模式：")
    console.log("  🔄 陀螺仪: applyShake(x, y, z) - 手动摇晃触发")
    console.log("  🚗 加速度计: applyAcceleration(x, y, z) - 车辆运动状态检测 [主力]")
    console.log("     - 检测振动强度（标准差）判断车辆运动")
    console.log(
      `     - 行驶中（振动>${MOTION_CONFIG.DRIVING_THRESHOLD}）：每${MOTION_CONFIG.EXCITATION_INTERVAL}ms持续激励 → 一直摇`,
    )
    console.log(`     - 停车后（振动<${MOTION_CONFIG.STOPPED_THRESHOLD}）：停止激励 → 渐渐不摇`)
    console.log("  🧭 设备姿态: applyOrientation(alpha, beta, gamma) - 辅助增强")
    console.log("     - 仅在行驶中响应姿态变化")
    console.log("     - 转弯/刹车时增强摆动效果")
    console.log("🚗 车载优化v5：与原始版本完全一致的算法")

    return () => {
      if (widgetRef.current) {
        widgetRef.current.unmount()
        widgetRef.current = null
      }
    }
  }, [])

  return <div id="sakana-widget" ref={containerRef}></div>
}

export default App
