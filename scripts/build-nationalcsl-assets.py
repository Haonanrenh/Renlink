#!/usr/bin/env python3
"""Build real NationalCSL-DP learning assets for Renlink.

The script reads the official NationalCSL-DP gloss.csv and one participant zip,
turns each Participant_02/front frame sequence into an mp4, then writes the
browser catalog consumed by frontend/js/sign-learning-module.js.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import shutil
import subprocess
import sys
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SOURCE_NAME = "NationalCSL-DP"
SOURCE_URL = "https://figshare.com/articles/media/NationalCSL-DP/27261843"
PARTICIPANT = "Participant_02"
VIEW = "front"
DEFAULT_FPS = 8

CATEGORY_LABELS = {
    "greeting": "问候",
    "time": "时间",
    "traffic": "交通",
    "medical": "医疗",
    "campus": "校园",
    "shopping": "购物",
    "help": "求助",
    "people": "人物",
    "place": "地点",
    "action": "动作",
    "food": "饮食",
    "number": "数字",
    "nature": "自然",
    "general": "通用",
}

CATEGORY_RULES = [
    ("greeting", ("你好", "您好", "再见", "谢谢", "感谢", "请", "对不起", "抱歉", "没关系", "欢迎", "祝", "恭喜", "早安", "晚安")),
    ("time", ("今天", "明天", "昨天", "早上", "上午", "中午", "下午", "晚上", "时间", "分钟", "小时", "星期", "周末", "月份", "今年", "去年", "明年", "生日", "现在")),
    ("traffic", ("公交", "公共汽车", "地铁", "火车", "汽车", "出租", "飞机", "机场", "车站", "交通", "骑车", "开车", "道路", "路线", "码头", "轮船")),
    ("medical", ("医院", "医生", "护士", "药", "疼", "痛", "发烧", "感冒", "咳嗽", "病", "急救", "健康", "治疗", "检查", "血", "牙", "胃", "药房")),
    ("campus", ("学校", "老师", "学生", "学习", "上课", "下课", "考试", "作业", "大学", "小学", "中学", "课堂", "教室", "图书馆", "毕业", "校长")),
    ("shopping", ("买", "卖", "钱", "银行", "商店", "超市", "价格", "便宜", "贵", "支付", "购物", "市场", "外卖", "菜单", "商品", "现金")),
    ("help", ("帮助", "帮忙", "救", "危险", "厕所", "地址", "电话", "报警", "求助", "迷路", "姓名", "名字", "联系", "需要", "请问")),
    ("people", ("朋友", "爸爸", "妈妈", "父亲", "母亲", "哥哥", "姐姐", "弟弟", "妹妹", "老师", "医生", "学生", "同学", "孩子", "老人", "人民", "同志", "经理")),
    ("place", ("家", "学校", "医院", "银行", "厕所", "商店", "公园", "机场", "车站", "城市", "农村", "中国", "北京", "上海", "四川", "地址", "房间")),
    ("food", ("饭", "菜", "水", "茶", "咖啡", "面包", "水果", "苹果", "香蕉", "牛奶", "肉", "鱼", "鸡", "吃", "喝", "餐厅")),
    ("number", ("一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "百", "千", "万", "第一", "第二", "数字")),
    ("nature", ("天", "地", "山", "水", "河", "海", "雨", "雪", "风", "云", "太阳", "月亮", "森林", "动物", "植物", "花", "树")),
    ("action", ("去", "来", "看", "听", "说", "写", "读", "走", "跑", "坐", "站", "工作", "学习", "休息", "买", "卖", "帮助", "喜欢", "需要")),
]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def parse_args() -> argparse.Namespace:
    project_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="Build full NationalCSL-DP frontend learning assets.")
    parser.add_argument("--gloss-csv", default="/tmp/nationalcsl-dp/gloss.csv", help="Path to NationalCSL-DP gloss.csv")
    parser.add_argument("--participant-zip", default="/tmp/nationalcsl-dp/Participant_02_full.zip", help="Path to Participant_02_full.zip")
    parser.add_argument("--frames-root", default="", help="Optional extracted frames root containing Participant_02/front/<id> folders")
    parser.add_argument("--frontend-root", default=str(project_root / "frontend"), help="Frontend root directory")
    parser.add_argument("--fps", type=int, default=DEFAULT_FPS, help="Output video FPS")
    parser.add_argument("--limit", type=int, default=0, help="Optional item limit for dry-run checks")
    parser.add_argument("--replace", action="store_true", help="Remove existing generated NationalCSL-DP videos before building")
    parser.add_argument("--retry-failed", action="store_true", help="Retry only items currently listed in failed.json")
    return parser.parse_args()


def ensure_imageio() -> Any:
    extra_deps = os.environ.get("NATIONALCSL_PYTHON_DEPS", "/tmp/nationalcsl-dp/pydeps")
    if extra_deps and Path(extra_deps).exists():
        sys.path.insert(0, extra_deps)

    try:
        import imageio.v2 as imageio  # type: ignore
    except ModuleNotFoundError as exc:
        raise SystemExit(
            "Missing imageio. Install it with:\n"
            "  python3 -m pip install --target /tmp/nationalcsl-dp/pydeps imageio imageio-ffmpeg"
        ) from exc

    return imageio


def ensure_ffmpeg_exe() -> str:
    extra_deps = os.environ.get("NATIONALCSL_PYTHON_DEPS", "/tmp/nationalcsl-dp/pydeps")
    if extra_deps and Path(extra_deps).exists():
        sys.path.insert(0, extra_deps)

    try:
        import imageio_ffmpeg  # type: ignore
    except ModuleNotFoundError as exc:
        raise SystemExit(
            "Missing imageio-ffmpeg. Install it with:\n"
            "  python3 -m pip install --target /tmp/nationalcsl-dp/pydeps imageio imageio-ffmpeg"
        ) from exc

    return imageio_ffmpeg.get_ffmpeg_exe()


def load_gloss_rows(gloss_csv: Path) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    with gloss_csv.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            dataset_id = row.get("#ID", "").strip()
            text = row.get("Chinese Sign Language Word", "").strip()
            if not dataset_id or not text:
                continue
            rows.append({"datasetId": dataset_id, "text": text})
    return rows


def normalize_text(text: str) -> str:
    return re.sub(r"\d+-\d+$", "", text).strip() or text.strip()


def choose_category(text: str) -> str:
    normalized = normalize_text(text)
    for category, keywords in CATEGORY_RULES:
        if any(keyword in normalized for keyword in keywords):
            return category
    return "general"


def choose_difficulty(text: str) -> str:
    normalized = normalize_text(text)
    length = len(normalized)
    if length <= 2:
        return "基础"
    if length <= 4:
        return "常用"
    return "进阶"


def catalog_item(row: dict[str, str], video_relative_path: str) -> dict[str, Any]:
    text = row["text"]
    dataset_id = row["datasetId"]
    category = choose_category(text)
    category_label = CATEGORY_LABELS[category]
    difficulty = choose_difficulty(text)
    normalized = normalize_text(text)
    tags = [category_label, "国家通用手语", "词级", "P02前视角"]
    if normalized != text:
        tags.append(normalized)

    return {
        "id": f"nationalcsl-{dataset_id}",
        "text": text,
        "type": "word",
        "category": category,
        "difficulty": difficulty,
        "tags": tags,
        "sourceName": SOURCE_NAME,
        "sourceUrl": SOURCE_URL,
        "datasetId": dataset_id,
        "playbackMode": "video",
        "videoUrl": video_relative_path,
        "avatarText": text,
        "notes": f"来自 {SOURCE_NAME} {PARTICIPANT} 前视角帧序列（#{dataset_id}），已转码为本地 mp4；前端只展示中文词项。",
    }


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return fallback


def index_frames(zip_file: zipfile.ZipFile) -> dict[str, list[str]]:
    pattern = re.compile(rf"^{PARTICIPANT}/{VIEW}/(\d{{4}})/\d+\.jpg$")
    frames: dict[str, list[str]] = {}
    for name in zip_file.namelist():
        match = pattern.match(name)
        if match:
            frames.setdefault(match.group(1), []).append(name)
    for names in frames.values():
        names.sort()
    return frames


def index_frame_dirs(frames_root: Path) -> dict[str, Path]:
    participant_root = frames_root / PARTICIPANT / VIEW
    if not participant_root.exists():
        participant_root = frames_root / VIEW
    if not participant_root.exists():
        participant_root = frames_root

    frame_dirs: dict[str, Path] = {}
    for child in participant_root.iterdir():
        if child.is_dir() and re.fullmatch(r"\d{4}", child.name):
            if any(child.glob("*.jpg")):
                frame_dirs[child.name] = child
    return frame_dirs


def update_progress(path: Path, progress: dict[str, Any]) -> None:
    progress["last_updated"] = utc_now()
    write_json(path, progress)


def load_failed_ids(path: Path) -> set[str]:
    failed = load_json(path, [])
    return {str(item.get("item")) for item in failed if item.get("item")}


def append_failure(path: Path, item_id: str, error: Exception) -> None:
    failed = load_json(path, [])
    failed.append({
        "item": item_id,
        "error": str(error),
        "attempts": 3,
        "failed_at": utc_now(),
    })
    write_json(path, failed)


def retry_with_backoff(action, item_id: str):
    delays = (2, 4, 8)
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            return action()
        except Exception as exc:  # noqa: BLE001 - each item is isolated and logged.
            last_error = exc
            if attempt < 2:
                print(f"  x Attempt {attempt + 1} failed for {item_id}: {exc}; retrying in {delays[attempt]}s...")
                time.sleep(delays[attempt])
    raise last_error if last_error else RuntimeError("unknown failure")


def write_video(imageio: Any, zip_file: zipfile.ZipFile, frame_names: list[str], output_path: Path, fps: int) -> None:
    temp_path = output_path.with_suffix(".tmp.mp4")
    if temp_path.exists():
        temp_path.unlink()

    with imageio.get_writer(
        temp_path,
        fps=fps,
        codec="libx264",
        macro_block_size=16,
        ffmpeg_params=["-pix_fmt", "yuv420p", "-movflags", "+faststart"],
    ) as writer:
        for frame_name in frame_names:
            data = zip_file.read(frame_name)
            writer.append_data(imageio.imread(io.BytesIO(data), format="jpg"))

    temp_path.replace(output_path)


def write_video_from_dir(ffmpeg_exe: str, frame_dir: Path, output_path: Path, fps: int) -> int:
    temp_path = output_path.with_suffix(".tmp.mp4")
    if temp_path.exists():
        temp_path.unlink()

    frame_count = len(list(frame_dir.glob("*.jpg")))
    input_pattern = str(frame_dir / "%05d.jpg")
    command = [
        ffmpeg_exe,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-framerate",
        str(fps),
        "-i",
        input_pattern,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "27",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(temp_path),
    ]
    subprocess.run(command, check=True)
    temp_path.replace(output_path)
    return frame_count


def write_catalog(frontend_root: Path, rows: list[dict[str, str]], video_dir: Path) -> list[dict[str, Any]]:
    catalog: list[dict[str, Any]] = []
    for row in rows:
        dataset_id = row["datasetId"]
        video_name = f"nationalcsl_{dataset_id}_p02_front.mp4"
        video_path = video_dir / video_name
        if not video_path.exists():
            continue
        video_relative = Path("assets/sign-videos/nationalcsl") / video_name
        catalog.append(catalog_item(row, video_relative.as_posix()))

    data_dir = frontend_root / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    catalog_path = data_dir / "sign-learning-catalog.js"
    catalog_json = json.dumps(catalog, ensure_ascii=False, indent=4)
    catalog_path.write_text(
        "// Generated from real NationalCSL-DP gloss.csv and Participant_02/front frame sequences.\n"
        "// Do not edit by hand; rerun scripts/build-nationalcsl-assets.py after updating source data.\n"
        "(function () {\n"
        f"    window.SIGN_LEARNING_CATALOG = {catalog_json};\n"
        "})();\n",
        encoding="utf-8",
    )
    return catalog


def write_readme(video_dir: Path, catalog: list[dict[str, Any]], fps: int) -> None:
    readme = f"""# NationalCSL-DP Renlink Assets

This directory is generated by `scripts/build-nationalcsl-assets.py`.

- Source: {SOURCE_NAME}
- Source URL: {SOURCE_URL}
- Source participant/view: `{PARTICIPANT}/{VIEW}`
- Browser format: mp4, H.264, yuv420p, {fps} fps
- Catalog items generated: {len(catalog)}
- File naming: `nationalcsl_{{datasetId}}_p02_front.mp4`

Only the Chinese gloss text from `gloss.csv` is written into the Renlink
learning catalog. The dataset's English translation column is not displayed in
the app, and no HKSL/ASL resources are mixed into this module.
"""
    (video_dir / "README.md").write_text(readme, encoding="utf-8")


def main() -> int:
    args = parse_args()

    gloss_csv = Path(args.gloss_csv).resolve()
    participant_zip = Path(args.participant_zip).resolve()
    frames_root = Path(args.frames_root).resolve() if args.frames_root else None
    frontend_root = Path(args.frontend_root).resolve()
    video_dir = frontend_root / "assets" / "sign-videos" / "nationalcsl"
    progress_path = video_dir / "progress.json"
    failed_path = video_dir / "failed.json"

    if args.replace and video_dir.exists() and not args.retry_failed:
        shutil.rmtree(video_dir)
    video_dir.mkdir(parents=True, exist_ok=True)

    rows = load_gloss_rows(gloss_csv)
    if args.limit:
        rows = rows[:args.limit]
    if args.retry_failed:
        failed_ids = load_failed_ids(failed_path)
        rows = [row for row in rows if row["datasetId"] in failed_ids]
        if failed_path.exists():
            failed_path.unlink()

    total = len(rows)
    source_path = frames_root if frames_root else participant_zip
    print(f"=== Task: NationalCSL-DP video/catalog build | Total: {total} | Source: {source_path} | Output: {video_dir} ===")

    existing_progress = load_json(progress_path, {})
    completed_ids = set(existing_progress.get("completed_ids", []))
    progress = {
        "status": "in_progress",
        "started_at": existing_progress.get("started_at", utc_now()),
        "total_items": total,
        "processed_items": len(completed_ids),
        "failed_items": len(load_json(failed_path, [])),
        "current_item": None,
        "last_updated": utc_now(),
        "eta_seconds": None,
        "completed_ids": sorted(completed_ids),
    }
    update_progress(progress_path, progress)

    start_time = time.time()
    if frames_root:
        ffmpeg_exe = ensure_ffmpeg_exe()
        frame_dirs_by_id = index_frame_dirs(frames_root)
        missing = [row["datasetId"] for row in rows if row["datasetId"] not in frame_dirs_by_id]
        if missing:
            raise RuntimeError(f"Missing {VIEW} frame folders for {len(missing)} ids; first: {missing[:10]}")

        for index, row in enumerate(rows, start=1):
            dataset_id = row["datasetId"]
            output_path = video_dir / f"nationalcsl_{dataset_id}_p02_front.mp4"
            timestamp = datetime.now().isoformat(timespec="seconds")
            print(f"[{timestamp}] Processing {index}/{total}: {dataset_id} {row['text']}")
            progress["current_item"] = dataset_id

            if dataset_id in completed_ids and output_path.exists():
                print("  ok Skipped existing")
                update_progress(progress_path, progress)
                continue

            try:
                frame_dir = frame_dirs_by_id[dataset_id]
                frame_count = retry_with_backoff(lambda: write_video_from_dir(ffmpeg_exe, frame_dir, output_path, args.fps), dataset_id)
                completed_ids.add(dataset_id)
                elapsed = max(time.time() - start_time, 1)
                processed_now = len(completed_ids)
                remaining = max(total - processed_now, 0)
                progress["processed_items"] = processed_now
                progress["failed_items"] = len(load_json(failed_path, []))
                progress["completed_ids"] = sorted(completed_ids)
                progress["eta_seconds"] = int((elapsed / max(processed_now, 1)) * remaining)
                print(f"  ok Completed ({frame_count} frames)")
            except Exception as exc:  # noqa: BLE001 - failure is recorded per item.
                append_failure(failed_path, dataset_id, exc)
                progress["failed_items"] = len(load_json(failed_path, []))
                print(f"  x Failed ({exc})")
            finally:
                update_progress(progress_path, progress)
    else:
        imageio = ensure_imageio()
        with zipfile.ZipFile(participant_zip) as zip_file:
            frames_by_id = index_frames(zip_file)
            missing = [row["datasetId"] for row in rows if row["datasetId"] not in frames_by_id]
            if missing:
                raise RuntimeError(f"Missing {VIEW} frame folders for {len(missing)} ids; first: {missing[:10]}")

            for index, row in enumerate(rows, start=1):
                dataset_id = row["datasetId"]
                output_path = video_dir / f"nationalcsl_{dataset_id}_p02_front.mp4"
                timestamp = datetime.now().isoformat(timespec="seconds")
                print(f"[{timestamp}] Processing {index}/{total}: {dataset_id} {row['text']}")
                progress["current_item"] = dataset_id

                if dataset_id in completed_ids and output_path.exists():
                    print("  ok Skipped existing")
                    update_progress(progress_path, progress)
                    continue

                try:
                    frame_names = frames_by_id[dataset_id]
                    retry_with_backoff(lambda: write_video(imageio, zip_file, frame_names, output_path, args.fps), dataset_id)
                    completed_ids.add(dataset_id)
                    elapsed = max(time.time() - start_time, 1)
                    processed_now = len(completed_ids)
                    remaining = max(total - processed_now, 0)
                    progress["processed_items"] = processed_now
                    progress["failed_items"] = len(load_json(failed_path, []))
                    progress["completed_ids"] = sorted(completed_ids)
                    progress["eta_seconds"] = int((elapsed / max(processed_now, 1)) * remaining)
                    print(f"  ok Completed ({len(frame_names)} frames)")
                except Exception as exc:  # noqa: BLE001 - failure is recorded per item.
                    append_failure(failed_path, dataset_id, exc)
                    progress["failed_items"] = len(load_json(failed_path, []))
                    print(f"  x Failed ({exc})")
                finally:
                    update_progress(progress_path, progress)

    catalog = write_catalog(frontend_root, load_gloss_rows(gloss_csv)[: args.limit or None], video_dir)
    manifest = {
        "sourceName": SOURCE_NAME,
        "sourceUrl": SOURCE_URL,
        "participant": PARTICIPANT,
        "view": VIEW,
        "fps": args.fps,
        "catalogItems": len(catalog),
        "generatedAt": utc_now(),
        "videoDirectory": str(video_dir),
    }
    write_json(video_dir / "manifest.json", manifest)
    write_readme(video_dir, catalog, args.fps)

    failures = load_json(failed_path, [])
    if failures:
        progress["status"] = "completed_with_failures"
        update_progress(progress_path, progress)
        print(f"Completed with {len(failures)} failures. See {failed_path}")
        return 1

    progress_path.unlink(missing_ok=True)
    if failed_path.exists():
        failed_path.unlink()
    print(f"Completed successfully. Generated {len(catalog)} catalog items.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
