# Mic dB Record

一个本地运行的小工具：

- 使用浏览器默认麦克风采样
- 将输入换算为相对分贝 `dBFS`
- 在网页上实时绘制 5 分钟时间曲线
- 由本地 Node 服务维护近 5 分钟最大值与平均值
- 通过 localhost TCP 向连接客户端推送统计 JSON

## 运行

```bash
npm start
```

然后打开：

```text
http://127.0.0.1:3000
```

页面中点击“开始监听”，授予麦克风权限即可。

## TCP 输出

TCP 服务监听：

```text
127.0.0.1:7070
```

每行一条 JSON，示例：

```json
{"type":"stats","unit":"dBFS","windowSeconds":300,"readingCount":12,"maxDb":-18.4,"avgDb":-39.7,"lastDb":-31.2,"updatedAt":"2026-03-29T09:00:00.000Z"}
```

在 PowerShell 中读取：

```powershell
$client = [System.Net.Sockets.TcpClient]::new("127.0.0.1", 7070)
$reader = [System.IO.StreamReader]::new($client.GetStream())
while (($line = $reader.ReadLine()) -ne $null) { $line }
```

## 说明

浏览器默认只能稳定拿到未校准的相对分贝，也就是 `dBFS`。如果你要得到接近声压级的 `dB SPL`，需要额外的硬件标定或校准偏移。
