import React from 'react'
import Link from 'next/link'

function Index() {
  return (
    <>
      <Link href="/about">
        <a>About</a>
      </Link>
      <br />
      <Link href="/server-rendered">
        <a>Server Rendered</a>
      </Link>
      <h1>Home</h1>
    </>
  )
}

export default Index
