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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ScrollExpandMedia from "@/components/ui/scroll-expansion-hero";

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
      <ScrollExpandMedia
        mediaType="image"
        mediaSrc="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1280&auto=format&fit=crop"
        bgImageSrc="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?q=80&w=1920&auto=format&fit=crop"
        title="换品片场 AI 商品替换"
        date="中小电商素材测试工具"
        scrollToExpand="滚动展开工作台"
        textBlend
      >
        <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-[1.05fr_0.95fr] md:items-center">
          <div className="space-y-5">
            <Badge className="bg-secondary text-secondary-foreground hover:bg-secondary">
              中小电商素材测试工具
            </Badge>
            <h1 className="text-3xl font-semibold tracking-normal text-slate-950 md:text-5xl">
              从爆款视频到自有商品素材
            </h1>
            <p className="text-base leading-8 text-slate-600 md:text-lg">
              上传 5 秒以内电商短视频，手动框选旧商品，再用自己的商品图生成替换后的视频素材。保留人物和背景，只改商品，用于带货素材快速测试。
            </p>
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

          <div className="grid gap-3 rounded-lg border bg-white/80 p-4 shadow-panel backdrop-blur">
            {["上传短视频", "框选旧商品", "上传商品图", "生成并预览"].map((item, index) => (
              <div key={item} className="flex items-center gap-3 rounded-md bg-slate-50 px-4 py-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-sm font-semibold text-primary">
                  {index + 1}
                </span>
                <span className="text-sm font-medium text-slate-700">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </ScrollExpandMedia>

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
