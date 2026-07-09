import io
import os

import alibabacloud_oss_v2 as oss
from dotenv import load_dotenv

load_dotenv()


class OSSService:
    def __init__(self) -> None:
        self.oss_bucket = os.environ["oss_bucket"]
        self.oss_region = os.environ["oss_region"]
        self.oss_folder = os.environ.get("oss_folder")

        credentials_provider = oss.credentials.StaticCredentialsProvider(
            access_key_id=os.environ["oss_access_key_id"],
            access_key_secret=os.environ["oss_access_key_secret"],
        )
        cfg = oss.config.load_default()
        cfg.credentials_provider = credentials_provider
        cfg.region = self.oss_region
        self._client = oss.Client(cfg)

    def upload(self, filename: str, data: bytes, folder: str | None = None) -> str:
        """上传文件到 OSS，返回公开访问 URL。"""
        target_folder = folder or self.oss_folder
        key = f"{target_folder}/{filename}" if target_folder else filename

        self._client.put_object(oss.PutObjectRequest(
            bucket=self.oss_bucket,
            key=key,
            body=io.BytesIO(data),
        ))

        url = f"https://{self.oss_bucket}.oss-{self.oss_region}.aliyuncs.com/{key}"
        return url
