# 手语学习数据接入说明

本模块只面向中文普通话语境下的中国手语/国家通用手语学习，不接入香港手语、美国手语或英文手语资源。

## 当前实现

- 数据源：NationalCSL-DP。
- 许可：CC BY 4.0。
- 前端 catalog：`frontend/data/sign-learning-catalog.js`。
- 本地视频：`frontend/assets/sign-videos/nationalcsl/nationalcsl_<datasetId>_p02_front.mp4`。
- 接入范围：`gloss.csv` 的全部 6,707 个中文词级条目。
- 视频范围：每个词项接入 1 个真实演示视频，来自 `Participant_02/front/<datasetId>/*.jpg` 前视角帧序列转码。
- 显示策略：前端只展示 `Chinese Sign Language Word` 中文词项，不展示英文翻译列，不混入 HKSL/ASL。

NationalCSL-DP 是 isolated sign language recognition 的词级数据集，不是连续句语料。因此本次实现不再拼接或伪造短句视频；如果后续需要连续句，应该在拿到 CSL-Daily 授权后作为单独来源接入。

## 数据来源

1. NationalCSL-DP  
   地址：https://figshare.com/articles/media/NationalCSL-DP/27261843  
   说明：覆盖中国国家通用手语完整词表方向，包含 6,707 个词项、10 位签署者和前/左两个视角。全量下载约 17GB。本项目为了本地可运行，只抽取 `Participant_02/front` 作为每个词项的一条真实学习视频。

2. CSL-Daily  
   地址：https://ustc-slr.github.io/datasets/2021_csl_daily/  
   说明：连续中文手语句子数据，需要签署研究协议后获取。本次未接入，避免用未授权或模拟句子内容替代真实数据。

3. 国家通用手语常用词表  
   地址：https://www.hxph.com.cn/allBooks/9674.jhtml  
   说明：可作为词汇规范参考，不提供可嵌入视频。

## 重新构建流程

1. 下载 `gloss.csv` 和一个参与者分包。

   ```bash
   mkdir -p /tmp/nationalcsl-dp
   curl -L https://ndownloader.figshare.com/files/53281958 -o /tmp/nationalcsl-dp/gloss.csv
   curl -L https://ndownloader.figshare.com/files/53410649 -o /tmp/nationalcsl-dp/Participant_02_full.zip
   ```

2. 只解压前视角帧，避免把左视角和全量 17GB 数据都落到本地。

   ```bash
   rm -rf /tmp/nationalcsl-dp/extracted
   mkdir -p /tmp/nationalcsl-dp/extracted
   unzip -q /tmp/nationalcsl-dp/Participant_02_full.zip 'Participant_02/front/*' -d /tmp/nationalcsl-dp/extracted
   ```

3. 安装临时转码依赖到 `/tmp`。

   ```bash
   python3 -m pip install --target /tmp/nationalcsl-dp/pydeps imageio imageio-ffmpeg
   ```

4. 生成 6,707 个 mp4 和前端 catalog。

   ```bash
   NATIONALCSL_PYTHON_DEPS=/tmp/nationalcsl-dp/pydeps \
   python3 scripts/build-nationalcsl-assets.py \
     --frames-root /tmp/nationalcsl-dp/extracted \
     --replace
   ```

5. 验证数据和 UI。

   ```bash
   node scripts/verify-sign-learning-data.mjs
   node scripts/verify-sign-learning-ui.mjs
   ```

## 维护规则

- 每个条目必须保留 `sourceName`、`sourceUrl`、`datasetId`、`videoUrl`。
- `datasetId` 必须是 NationalCSL-DP 的 4 位编号。
- `videoUrl` 必须指向本地真实 mp4，不允许指向占位视频。
- 不允许使用 `ASL`、`American Sign Language`、`HKSL`、`Hong Kong Sign Language`、`香港手语` 等来源。
- 原始 zip 和抽帧目录不要提交；它们只用于重新生成浏览器 mp4。
