import React from 'react'
import Link from 'next/link'

function Index() {
  return (
    <>
      <Link href="/about">
        <a>About</a>
      </Link>
      <h1>Home</h1>
    </>
  )
}

export default Index
