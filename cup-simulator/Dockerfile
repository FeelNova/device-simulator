FROM alibaba-cloud-linux-3-registry.cn-hangzhou.cr.aliyuncs.com/alinux3/node:20.16


# 关键：切换到 root 用户，否则 npm 无法写 package-lock.json
USER root

WORKDIR /app

# 先复制 package.json，加速构建
COPY package*.json ./

# 安装依赖
RUN npm install

# 再复制源码
COPY . .

# 构建
RUN npm run build


# 把文件权限交给 node 用户（非常关键）
RUN chown -R node:node /app

EXPOSE 3000

CMD ["npm", "start", "--", "-H", "0.0.0.0"]