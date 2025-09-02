# Set up Docker and NGINX for a Next.js app

In this tutorial we are going to set up a production Docker environment for a Next.js app with NGINX as a reverse-proxy.

We will use Docker to run Next.js and NGINX in separate containers and have NGINX cache static assets.

If you don't already have a Next.js app, we'll create a very basic one first.


## Table of contents

- [Assumptions](#assumptions)
- [Creating a simple Next.js app](#creating-a-simple-nextjs-app)
- [Dockerising Next.js](#dockerising-nextjs)
- [PM2](#pm2)
- [Adding PM2 to our Dockerfile](#adding-pm2-to-our-dockerfile)
- [Adding a .dockerignore file](#adding-a-dockerignore-file)
- [Testing our app container](#testing-our-app-container)
- [NGINX](#nginx)
- [Adding our NGINX configuration](#adding-our-nginx-configuration)
- [Adding an upstream server](#adding-an-upstream-server)
- [Passing requests to our Next.js app](#passing-requests-to-our-nextjs-app)
- [Caching static assets with NGINX](#caching-static-assets-with-nginx)
- [Enabling gzip in NGINX](#enabling-gzip-in-nginx)
- [Final NGINX configuration](#final-nginx-configuration)
- [Dockerising NGINX](#dockerising-nginx)
- [Managing our containers with Docker Compose](#managing-our-containers-with-docker-compose)
- [Launching our containers](#launching-our-containers)
- [No Docker Compose?](#no-docker-compose)
- [Testing NGINX caching](#testing-nginx-caching)


## Assumptions

I will assume that you have that you are familiar with the basics of Docker and have it up and running on your machine.

You don't really need to know much about NGINX as we'll use a lot of the default setup and focus mainly on the configuration for caching and passing requests to the Next.js app.


## Creating a simple Next.js app

If you're reading this then I'm assuming you already have a Next.js app or that you are familiar with how to use it.

If you do already have a Next.js project set up then you can skip over this section.

Otherwise, let's quickly create a very basic app.

Let's start a new Node.js project and install the dependencies:

```bash
npm install next@9.0.3 react@16.8.6 react-dom@16.8.6
```

_Make sure to use these exact versions for compatibility._


As per the [Next.js docs](https://nextjs.org/docs), let's now add some scripts to our `package.json` file:

```json
...

"scripts": {
  "dev": "next",
  "build": "next build",
  "start": "next start"
},
"dependencies": {
  "next": "^9.0.3",
  "react": "^16.8.6",
  "react-dom": "^16.8.6"
},

...
```

- `dev` runs the server in development mode
- `build` builds the project files for production
- `start` runs the server in production mode

Now we can add a `pages/` directory and a `static/` directory in the root of our project:

```bash
pages/                # Route components
static/               # Static assets (images, etc.)
  - home.jpg
  - about.jpg
package-lock.json
package.json
```

I've added some images to the `static/` directory to use in our components so that we can test out caching of static assets later.

Any images will do.

Let's create a new component file `pages/index.js`. This will be our home page route, `/`:

```jsx
import React from 'react'
import Link from 'next/link'

function Home() {
  return (
    <>
      <Link href="/about">
        <a>About</a>
      </Link>
      <h1>Home</h1>
      <img src="/static/home.jpg" />
    </>
  )
}

export default Home
```

Let's also create the `/about` route that we link to above by adding a new `pages/about.js` file with the following similar content:

```jsx
import React from 'react'
import Link from 'next/link'

function About() {
  return (
    <>
      <Link href="/">
        <a>Home</a>
      </Link>
      <h1>About</h1>
      <img src="/static/about.jpg" />
    </>
  )
}

export default About
```

So now we have two simple pages that link to each other so we can test everything out later.


## Dockerising Next.js

Let's start by adding a `Dockerfile` to the root of our project, with the following content:

```Dockerfile
# Base on offical Node.js Alpine image
FROM node:alpine

# Set working directory
WORKDIR /usr/app

# Copy package.json and package-lock.json before other files
# Utilise Docker cache to save re-installing dependencies if unchanged
COPY ./package*.json ./

# Install dependencies
RUN npm install --production

# Copy all files
COPY ./ ./

# Build app
RUN npm run build

# Expose the listening port
EXPOSE 3000

# Run container as non-root (unprivileged) user
# The node user is provided in the Node.js Alpine base image
USER node

# Run npm start script when container starts
CMD [ "npm", "start" ]
```

We're basing our image on the official Node.js image with the Alpine distribution of Linux. Alpine is a very lightweight Linux distribution focused on security and a small file size.

We are using the "latest" version of Node.js but you can use an [image with a specific version of Node.js](https://hub.docker.com/_/node/) if you prefer.

Notice that we copy over our project files to our image in two stages.

First we copy over our `package.json` and `package-lock.json` files, then we install our dependencies, and then copy the rest of our files.

The reason we do this is to take advantage of Docker's caching system. At each step (or layer) in the `Dockerfile` process, Docker will cache the result so that it can re-build the image much faster next time.

If we were to copy over all of the files in one go, changing any file in our project would cause Docker to install the dependencies again on subsequent builds, even if the dependencies have not changed.

By copying the files over in two stages, Docker can use the cached layers, including the layer with the dependencies, if our `package.json` or `package-lock.json` files have not changed.

By default, Docker will run containers as root. Running Node.js as root can lead to security issues. For this reason, after all setup and running our build, we then switch to a non-root, unprivileged user, `node`. This is provided for us by the base `node:alpine` image.

Finally, we define a command that will run when Docker starts a container from our image. We use our `npm start` script, which starts the Next.js server in production mode.


## PM2

[PM2](https://pm2.io/) is a production ready process manager for Node.js applications.

We could simply run `npm start` directly when our container starts, as above, but this is a bad idea in production. If our app crashes for some reason, our Node.js process will exit and our app will no longer be available.

PM2 solves this problem by ensuring that our app is always restarted after crashing.


## Adding PM2 to our Dockerfile

Back in our `Dockerfile`, we can install PM2 globally using npm.

As this is unlikely to change, let's do the installation towards the beginning of our `Dockerfile` to ensure that layer is cached and not re-installed every time we re-build our Docker image:

```Dockerfile
# Base on offical Node.js Alpine image
FROM node:alpine

# Set working directory
WORKDIR /usr/app

# Install PM2 globally
RUN npm install --global pm2

# Copy package.json and package-lock.json before other files
# Utilise Docker cache to save re-installing dependencies if unchanged
COPY ./package*.json ./

# Install dependencies
RUN npm install --production

# Copy all files
COPY ./ ./

# Build app
RUN npm run build

# Expose the listening port
EXPOSE 3000

# Run container as non-root (unprivileged) user
# The node user is provided in the Node.js Alpine base image
USER node

# Run npm start script with PM2 when container starts
CMD [ "pm2-runtime", "npm", "--", "start" ]
```

We have also changed our start-up command.

The `pm2-runtime` command is a drop-in replacement for `node` so instead of say `node index.js`, we can run `pm2-runtime index.js` to launch our application with PM2.

However, PM2 also supports using **npm** so we can still use our `start` script to launch our application.

We can launch **npm** with PM2 using the command `pm2-runtime npm` and then pass arguments after the `--`. We pass `start` as an argument, effectively running `npm start`.


## Adding a .dockerignore file

The `COPY ./ ./` command in our `Dockerfile` is going to copy all of our files to the Docker image. However, we don't really need everything copied over as this could bloat our image.

Also, `node_modules/` should be installed in the environment in which they will run, rather than copied from the host environment, which may be running a different operating system.

We can add a `.dockerignore` file to the root of our project to exclude any files that aren't necessary for a production deployment:

```bash
.git/
.gitignore
.next/                # Existing Next.js builds
.dockerignore
Dockerfile
docker-compose.yml
node_modules/         # Installed inside container
nginx/                # We'll create this directory soon
```

You can add any other files you have in your project that aren't necessary.


## NGINX

Ok, so now that we have our Next.js app containerised, we're going to add another container for our NGINX reverse-proxy.

It's possible to launch a single container running both NGINX and Next.js but it's generally a better idea to run one process per container.

This could also be useful later on if you need to scale them individually.

But first, let's configure NGINX for our Next.js app.


## Adding our NGINX configuration

Let's add a new directory, `nginx/`, in the root of our project. Inside, create a file called `default.conf`:

```bash
nginx/                # Reverse-proxy
  - default.conf
pages/                # Route components
  - index.js
  - about.js
static/               # Static assets (images, etc.)
  - home.jpg
  - about.jpg
.dockerignore
Dockerfile
package-lock.json
package.json
```

I've called this file `default.conf` as it's going to contain the configuration for our **default** server, which will handle all requests. However, you can call this whatever you want as long as it has the extension `.conf`.

If you end up having NGINX handle multiple servers then you can just add more configuration files for them, with appropriate names.

We'll start by adding a `server` block and set it to listen on port **80**, the default HTTP port:

```nginx
server {
  listen 80 default_server;

  server_name _;

  server_tokens off;
}
```

As it's our default server and will handle all requests that aren't matched by other `server` blocks (we don't have any), we don't need a name. So we'll just use `_`.

We also turn off server tokens so that the NGINX version doesn't appear in the response headers.


## Adding an upstream server

We are now going to add an `upstream` block, which is a group of servers that we can reference by a given name.

In future, we could add multiple Next.js containers running on different ports into our `upstream` and NGINX would load-balance the requests between them:

```nginx
upstream nextjs_upstream {
  server nextjs:3000;

  # We could add additional servers here for load-balancing
}

server {
  listen 80 default_server;

  server_name _;

  server_tokens off;
}
```

Note here, that we are specifying the server in our `upstream` as `nextjs:3000`.

Where does `nextjs:3000` come from?

We are running NGINX in its own container, so `localhost` actually refers to the container itself.

However, our Next.js app is in a different container.

Therefore, we could reference it by it's IP address. Or, we could use Docker's **link** functionality to map that IP address to a name that we can reference instead. In this case `nextjs`.

Later, we'll set up **Docker Compose** to launch our containers, which will automatically set up the links for us.

So when we reference `nextjs:3000`, we are actually referencing the Next.js container on port 3000.


## Passing requests to our Next.js app

As we are using NGINX as a reverse-proxy in front of our Next.js app, we will now add in some configuration to ensure that NGINX gets the correct response once it's passed on from NGINX.

We'll start with the [configuration provided by Next.js](https://github.com/zeit/next.js/wiki/Deployment-on-Nginx's-reverse-proxy):

```nginx
upstream nextjs_upstream {
  server nextjs:3000;
}

server {
  listen 80 default_server;

  server_name _;

  server_tokens off;

  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection 'upgrade';
  proxy_set_header Host $host;
  proxy_cache_bypass $http_upgrade;

  location / {
    proxy_pass http://nextjs_upstream;
  }
}
```

We are passing the request to our upstream `http://nextjs_upstream`, as discussed above, rather than `http://localhost:3000`, which was specified in the config provided by Next.js.

We can also move the `proxy_*` directives out into the `server` block as we'll be adding additional `location` blocks shortly and these directives will be inherited by any child `location` blocks, which saves us duplicating them.

Note, however, that the `proxy_pass` directive cannot be placed in the `server` block, so it has to be in each `location` block instead.


## Caching static assets with NGINX

A major benefit of using NGINX is that it is more efficient at serving static assets that Node.js is.

NGINX has a very capable proxy cache feature, which we'll use to save static files once they have been requested the first time, meaning future requests will effectively be served directly from the NGINX file system.

This saves us from hitting the Node.js server on every request.

Let's first create a new cache zone. This is an area in memory that holds cache keys, that NGINX can use to determine if a file has been cached or not.

At the very top of our `nginx/default.conf` file, add the following directive:

```nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=STATIC:10m inactive=7d use_temp_path=off;
```

The options we have used here are as follows:
- `/var/cache/nginx` sets a directory to store the cached assets
- `levels=1:2` sets up a two‑level directory hierarchy as file access speed can be reduced when too many files are in a single directory
- `keys_zone=STATIC:10m` defines a shared memory zone for cache keys named "STATIC" and with a size limit of 10MB (which should be more than enough unless you have thousands of files)
- `inactive=7d` is the time that items will remain cached without being accessed (7 days), after which they will be removed
- `use_temp_path=off` tells NGINX to write files directly to the cache directory and avoid unnecessary copying of data to a temporary storage area first

Now let's make use of our new cache, starting with the Next.js built assets.

When you run a build of your project, Next.js creates some static files including JavaScript bundles for each of your pages, and makes them available at the path `/_next/static/*`.

So, let's add a new `location` block to our config file where we can tell NGINX to cache these files:

```nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=STATIC:10m inactive=7d use_temp_path=off;

upstream nextjs_upstream {
  server nextjs:3000;
}

server {
  listen 80 default_server;

  server_name _;

  server_tokens off;

  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection 'upgrade';
  proxy_set_header Host $host;
  proxy_cache_bypass $http_upgrade;

  location /_next/static {
    proxy_cache STATIC;
    proxy_pass http://nextjs_upstream;

    # For testing cache - remove before deploying to production
    add_header X-Cache-Status $upstream_cache_status;
  }

  location / {
    proxy_pass http://nextjs_upstream;
  }
}
```

We tell NGINX to use our cache zone that we called `STATIC` to cache any file whose path contains the `/_next/static` directory.

We then pass all requests on to our Next.js app.

We've added a custom header, `X-Cache-Status`, with the value set to `$upstream_cache_status`. We will use this to test our cache later on. However, you should remove this before deploying to production.

Next up are the static assets, such as images, that we place in the `static/` directory and Next.js makes available at the path `/static/*`.

We can add a new location block to handle these assets and, again, tell NGINX to use our `STATIC` cache zone before passing request on to our Next.js app:

```nginx
location /_next/static {
  ...
}

location /static {
  proxy_cache STATIC;
  proxy_pass http://nextjs_upstream;

  # For testing cache - remove before deploying to production
  add_header X-Cache-Status $upstream_cache_status;
}
```

We actually have to a little extra to do with these static assets though.

Next.js handles setting headers for browser caching. For the built static assets at `/_next/static/*`, the url has a unique build ID in it so the browser cache headers are set to cache **forever**. If you rebuild the app, the url will be different and so the browser will actually be requesting a different resource.

However, with the static assets in the `static/` directory, there is no build ID. They are just made available at the `/static/*` path unchanged. Therefore, Next.js sets **no-cache** headers for these assets so the browser never caches them. If the assets change, the url remains the same so we don't want our users to have out-of-date assets.

The problem is that NGINX respects these headers and, therefore, will not actually cache these files by default.

We can get around this by telling NGINX to ignore the `Cache-Control` headers from our proxied Next.js app:

```nginx
location /static {
  proxy_cache STATIC;
  proxy_ignore_headers Cache-Control;
  proxy_cache_valid 60m;
  proxy_pass http://nextjs_upstream;

  # For testing cache - remove before deploying to production
  add_header X-Cache-Status $upstream_cache_status;
}
```

We also set a validity period for these cached files. We have set the cached assets to be valid for **60 minutes**, after which NGINX will refresh the assets from our proxied app the next time they are requested.

Therefore, our Next.js app will only be hit at most once an hour for each `/static/*` asset.

Note, when you set the `proxy_cache` directive without a validity period, the assets will remain in the cache indefinitely, however, any cached assets _will_ still be removed after the **inactive** period is up (7 days in our case).


## Enabling gzip in NGINX

Let's now enable gzip on our NGINX server to ensure that our files are compressed before sending to our users.

Add the following to the `server` block:

```nginx
gzip on;
gzip_proxied any;
gzip_comp_level 4;
gzip_types text/css application/javascript image/svg+xml;
```

- `gzip on` enables gzip
- `gzip_proxied any` tells NGINX that any proxied files can be gzipped
- `gzip_comp_level 4` sets a compression level - 4 is generally good
- `gzip_types text/css application/javascript image/svg+xml` sets the types of files to compress

Note, you can set the compression level higher for smaller file sizes but, the higher the compression level, the longer it takes to compress and decompress. Plus the file size savings tend to diminish after about level 4.

Also note, gzip works best on text-heavy file formats. It's generally not a good idea to compress images as these file formats tend to be highly compressed anyway so gzip execution time will outweigh and file size benefits that you may get. However, SVG is text based so can benefit from gzip compression.


## Final NGINX configuration

Our final NGINX configuration file should now look like this:

```nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=STATIC:10m inactive=7d use_temp_path=off;

upstream nextjs_upstream {
  server nextjs:3000;
}

server {
  listen 80 default_server;

  server_name _;

  server_tokens off;

  gzip on;
  gzip_proxied any;
  gzip_comp_level 4;
  gzip_types text/css application/javascript image/svg+xml;

  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection 'upgrade';
  proxy_set_header Host $host;
  proxy_cache_bypass $http_upgrade;

  location /_next/static {
    proxy_cache STATIC;
    proxy_pass http://nextjs_upstream;

    # For testing cache - remove before deploying to production
    add_header X-Cache-Status $upstream_cache_status;
  }

  location /static {
    proxy_cache STATIC;
    proxy_ignore_headers Cache-Control;
    proxy_cache_valid 60m;
    proxy_pass http://nextjs_upstream;

    # For testing cache - remove before deploying to production
    add_header X-Cache-Status $upstream_cache_status;
  }

  location / {
    proxy_pass http://nextjs_upstream;
  }
}
```


## Dockerising NGINX

Let's add the following content to our `nginx/Dockerfile`:

```Dockerfile
# Base on offical NGINX Alpine image
FROM nginx:alpine

# Remove any existing config files
RUN rm /etc/nginx/conf.d/*

# Copy config files
# *.conf files in conf.d/ dir get included in main config
COPY ./default.conf /etc/nginx/conf.d/

# Expose the listening port
EXPOSE 80

# Launch NGINX
CMD [ "nginx", "-g", "daemon off;" ]
```

We can start by basing our image on the offical NGINX Docker image using the Alpine distribution of Linux.

Again, were using the "latest" version of NGINX but you can use an [image with a specific version of NGINX](https://hub.docker.com/_/nginx) if you prefer.

Now, NGINX comes with a default config file, `/etc/nginx/nginx.conf`, which we could have chosen to overwrite with our own. However, this file includes some useful settings and is also set up to import all `.conf` files from the `/etc/nginx/conf.d` directory, so we make use of that instead.

As yoy can see from our `Dockefile` above, we remove any existing configuartion files in the `/etc/nginx/conf.d` directory and then we copy over our own configuration file, `default.conf`.


## Managing our containers with Docker Compose

Lastly, let's set up **Docker Compose** to simplify the building and running of our containers.

Docker Compose is a CLI tool for defining and running multi-container Docker applications, and should be included with your Docker installation.

It allows us to define a configuration file and run a single command to start and link our containers together rather than having to build and run each one using the individual Docker commands.

Let's add a `docker-compose.yml` file to the root of our project:

```yaml
version: '3'
services:
  nextjs:
  nginx: 
```

We start by specifiying the version of Docker Compose that we want to use. There are differences in each version to we need to specify this.

Next, we add a `services` property where we define the containers we want to run.

We'll name these `nextjs` and `nginx`.

Docker Compose will automatically set up a shared network and will make each container available to the others by mapping its IP addresses to its corresponding service name.

You can call these whatever you want, but remember that we reference `nextjs` in our NGINX configuration file, so, if you change the name here, remember to change it in `nginx/default.conf` too.

We need to tell each of our services where to build the image from. The `build` property tells **Docker Compose** which directory to use as the base for the image, and where it will find the `Dockerfile`:

```yaml
version: '3'
services:
  nextjs:
    build: ./
  nginx:
    build: ./nginx
```

So the Next.js image will be built from the root directory using the root `Dockefile` and the NGINX image will be built from the `nginx/` directory using the `nginx/Dockerfile`.

Lastly, we want to be able to access our NGINX container from the outside world so we need to publish a port. Let's publish port 80 (the default HTTP port) to port 80 inside the container, which NGINX is listening on:

```yaml
version: '3'
services:
  nextjs:
    build: ./
  nginx:
    build: ./nginx
    ports:
      - 80:80
```

Note, we don't publish a port for the Next.js container as we don't want it to be accessible from the outside world. All requests must go through NGINX.

However, our NGINX container can still talk to our Next.js container by referencing it by the service name `nextjs:3000` specified in `docker-compose.yml` as they are available on a shared network set up by Docker Compose.


## Launching our containers

We can now build and run our Docker containers by running the following command:

`docker-compose up`

We can now go to `http://localhost` in a browser (no port as 80 is default for HTTP) and see our app in all it's glory.

Note, if you need to force a re-build of the images in future you can run:

`docker-compose up --build`


## No Docker Compose?

If for any reason you can't or don't want to use Docker Compose, then here are the commands you can run instead:

```bash
# Build images
docker build --tag nextjs-image .
docker build --tag nginx-image ./nginx

# Create shared network
docker network create my-network

# Run containers
docker run --network my-network --name nextjs-container nextjs-image
docker run --network my-network --link nextjs-container:nextjs --publish 80:80 nginx-image
```

_NOTE: We need to use `--link` to map our Next.js container to our NGINX container as it is referenced as `nextjs` in `default.conf`._


## Testing NGINX caching

Now that we have our containers up and running, let's test that our NGINX cache is working by making use of that `X-Cache-Status` header that we added earlier.

In the developer tools, open the **Network** tab and click on one of the requests for a file with the path `/_next/static/*` or `/static/*`.

You will see the `X-Cache-Status` header. It's value should be **MISS** the first time you load the site. This is because the cache is empty the first time.

If you refresh the page (ensure that browser cache is disabled or cleared) then you should see that this time the `X-Cache-Status` header has a value of **HIT**, signalling that NGINX served the file from cache.

When ready, we can go back to the `nginx/default.conf` file and remove the `X-Cache-Status` headers so that they don't get deployed.
