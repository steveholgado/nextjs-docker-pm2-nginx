import React from 'react'
import Link from 'next/link'

function ServerRendered({ test }) {
  return (
    <>
      <Link href="/">
        <a>Home</a>
      </Link>
      <br />
      <Link href="/about">
        <a>About</a>
      </Link>
      <h1>{test}</h1>
    </>
  )
}

ServerRendered.getInitialProps = function() {
  return {
    test: 'Hello World',
  }
};

export default ServerRendered
