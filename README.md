# Mic dB Record

一个本地运行的小工具：

- 后端直接使用系统默认麦克风采样
- 将输入换算为相对分贝 `dBFS`
- 在网页上实时绘制最近 10 秒曲线
- 通过 `localhost` TCP 广播最近 5 分钟的最大值与平均值

## 运行

```bash
npm start
```

然后打开：

```text
http://127.0.0.1:3000
```

页面不会请求浏览器麦克风权限。浏览器只负责展示后端推送的实时数据，曲线是否更新取决于后端是否已经成功采样系统默认麦克风。

如果 `naudiodon` 在 Windows 上安装失败，需要先补齐 `node-gyp` 所需的 C++ 构建工具，再重新执行依赖安装。

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

- 浏览器只作为展示页面，不负责音频采样，也不会上传 `/api/readings`
- 当前显示的是未校准的相对分贝 `dBFS`，不是物理意义上的 `dB SPL`
- 如果后端没有可用的默认输入设备，页面会显示不可用状态，但仍可正常打开
