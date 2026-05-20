import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  Download,
  MousePointer2,
  ShieldAlert,
  Sparkles,
  UploadCloud,
  Video
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AnimatedShaderHero from "@/components/ui/animated-shader-hero";

const steps = [
  {
    title: "上传短视频",
    description: "仅支持 5 秒以内 MP4，适合爆款素材的快速试投。",
    icon: UploadCloud
  },
  {
    title: "框选旧商品",
    description: "在第一帧上手动圈出唯一要替换的商品区域。",
    icon: MousePointer2
  },
  {
    title: "上传商品图",
    description: "支持 1 到 5 张商品图，用于约束生成主体。",
    icon: Boxes
  },
  {
    title: "生成与预览",
    description: "默认 mock 可演示流程，配置云雾可灵或 fal.ai 后提交真实视频替换任务。",
    icon: Sparkles
  }
];

const limits = [
  "不支持 NSFW",
  "不支持换脸",
  "不支持去水印",
  "不支持仿冒品牌 Logo",
  "不支持违法违禁商品",
  "不承诺 100% 成功"
];

export default function HomePage() {
  return (
    <div className="pb-20">
      <AnimatedShaderHero
        trustBadge={{
          text: "中小电商素材测试工具",
          icons: ["✨"]
        }}
        headline={{
          line1: "换品片场",
          line2: "AI 商品替换"
        }}
        subtitle="上传 5 秒以内电商短视频，框选旧商品，再用自己的商品图生成替换后的视频素材。保留人物和背景，只改商品。"
        buttons={{
          primary: {
            text: "开始生成",
            href: "/create"
          },
          secondary: {
            text: "查看历史",
            href: "/history"
          }
        }}
        className="min-h-[calc(100vh-4rem)]"
      />

      <section className="border-b bg-white">
        <div className="container grid min-h-[calc(100vh-4rem)] items-center gap-10 py-12 lg:grid-cols-[1fr_0.95fr] lg:py-16">
          <div className="space-y-8">
            <div className="space-y-4">
              <Badge className="bg-secondary text-secondary-foreground hover:bg-secondary">
                中小电商素材测试工具
              </Badge>
              <div className="space-y-5">
                <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-normal text-slate-950 md:text-6xl">
                  换品片场
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-slate-600">
                  上传 5 秒以内电商短视频，手动框选旧商品，再用自己的商品图生成替换后的视频素材。保留人物和背景，只改商品，用于带货素材快速测试。
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 rounded-md px-5">
                <Link href="/create">
                  开始生成
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12 rounded-md px-5">
                <Link href="/history">查看历史</Link>
              </Button>
            </div>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-lg border bg-slate-950 shadow-panel">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-white">
                  <Video className="h-4 w-4 text-cyan-300" />
                  5s 商品替换任务
                </div>
                <Badge className="bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/15">
                  processing
                </Badge>
              </div>
              <div className="grid gap-0 md:grid-cols-2">
                <div className="relative aspect-[4/5] bg-slate-900">
                  <div className="absolute inset-x-6 top-8 h-24 rounded-md bg-cyan-300/20" />
                  <div className="absolute bottom-0 left-1/2 h-64 w-36 -translate-x-1/2 rounded-t-full bg-slate-200" />
                  <div className="absolute bottom-16 left-1/2 h-28 w-28 -translate-x-1/2 rounded-md border-2 border-amber-300 bg-amber-400/90 shadow-lg" />
                  <div className="absolute bottom-12 left-10 rounded bg-white/90 px-2 py-1 text-xs font-medium text-slate-900">
                    原视频
                  </div>
                </div>
                <div className="relative aspect-[4/5] bg-slate-900">
                  <div className="absolute inset-x-6 top-8 h-24 rounded-md bg-cyan-300/20" />
                  <div className="absolute bottom-0 left-1/2 h-64 w-36 -translate-x-1/2 rounded-t-full bg-slate-200" />
                  <div className="absolute bottom-16 left-1/2 h-28 w-28 -translate-x-1/2 rounded-md border-2 border-emerald-300 bg-emerald-500/90 shadow-lg" />
                  <div className="absolute bottom-12 left-10 rounded bg-white/90 px-2 py-1 text-xs font-medium text-slate-900">
                    替换后
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-4 border-t border-white/10 text-xs text-slate-300">
                {["上传", "框选", "生成", "预览"].map((item) => (
                  <div key={item} className="border-r border-white/10 px-3 py-3 last:border-r-0">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container py-16">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <Badge variant="outline" className="mb-3 bg-white">
              生成流程
            </Badge>
            <h2 className="text-3xl font-semibold tracking-normal text-slate-950">
              从爆款视频到自有商品素材
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-slate-600">
            MVP 聚焦单物品替换。商家上传视频和商品图后，系统创建 AI 任务并展示进度，后续可替换为真实视频处理服务。
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <Card key={step.title} className="rounded-lg shadow-none">
                <CardHeader className="space-y-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">{step.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-slate-600">
                  {step.description}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="border-y bg-white">
        <div className="container grid gap-8 py-14 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <Badge variant="outline">安全边界</Badge>
            <h2 className="text-3xl font-semibold tracking-normal">只做商品替换，不做违规改造</h2>
            <p className="text-sm leading-7 text-slate-600">
              工具会在创建任务前提示限制，真实版本应接入内容安全审核、品牌 Logo 检测和任务风控。
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {limits.map((limit) => (
              <div key={limit} className="flex items-center gap-3 rounded-lg border bg-slate-50 px-4 py-3">
                <ShieldAlert className="h-4 w-4 text-orange-600" />
                <span className="text-sm text-slate-700">{limit}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container py-16">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["任务队列", "详情页会轮询真实 provider 状态，BullMQ + Redis 接口也已预留。", BadgeCheck],
            ["对象存储", "本地上传目录模拟存储，API 返回统一 Asset。", UploadCloud],
            ["结果分发", "成功后展示生成视频，支持下载和重新生成。", Download]
          ].map(([title, description, Icon]) => {
            const IconComponent = Icon as typeof BadgeCheck;
            return (
              <Card key={title as string} className="rounded-lg shadow-none">
                <CardHeader>
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
                    <IconComponent className="h-5 w-5" />
                  </div>
                  <CardTitle>{title as string}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-slate-600">
                  {description as string}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
